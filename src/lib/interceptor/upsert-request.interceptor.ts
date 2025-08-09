/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CrudOptions, CrudUpsertRequest, EntityType, FactoryOption } from '../interface';

const method = Method.UPSERT;
export function UpsertRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req = context.switchToHttp().getRequest<Request>();
            const upsertOptions = crudOptions.routes?.[method] ?? {};

            const params = await this.checkParams(
                crudOptions.entity,
                req.params,
                factoryOption.columns,
                new ConflictException('Invalid params'),
            );

            const primaryKeySet = new Set((factoryOption.primaryKeys ?? []).map((primaryKey) => primaryKey.name));
            for (const [key, value] of Object.entries(req.params)) {
                if (primaryKeySet.has(key)) {
                    continue;
                }
                if (!_.isNil(req.body[key]) && `${req.body[key]}` !== `${value}`) {
                    this.crudLogger.log(`The value of ${req.body[key]} for ${key} is not ${value}`);
                    throw new ConflictException(`${key}'s value of body and param do not match`);
                }
                req.body[key] = value;
            }

            // Filter body parameters based on allowedParams
            const allowedParams = upsertOptions.allowedParams ?? crudOptions.allowedParams;
            if (allowedParams && req.body && typeof req.body === 'object') {
                req.body = this.filterAllowedParams(req.body, allowedParams);
            }

            const body = await this.validateBody(req.body ?? {}, upsertOptions);

            const crudUpsertRequest: CrudUpsertRequest<typeof crudOptions.entity> = {
                params,
                body,
                exclude: new Set(upsertOptions.exclude ?? []),
                saveOptions: {
                    listeners: upsertOptions.listeners,
                },
                hooks: upsertOptions.hooks,
            };

            this.crudLogger.logRequest(req, crudUpsertRequest);
            (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpsertRequest;

            return next.handle();
        }

        filterAllowedParams(body: any, allowedParams: string[]): any {
            if (!body || typeof body !== 'object') {
                return body;
            }

            const filtered: any = {};
            for (const key of Object.keys(body)) {
                if (allowedParams.includes(key)) {
                    filtered[key] = body[key];
                }
            }
            return filtered;
        }

        async validateBody(body: unknown, methodOptions: any = {}) {
            console.log('🔍 UPSERT validateBody called with:', {
                bodyKeys: body && typeof body === 'object' ? Object.keys(body) : 'invalid body',
                methodOptions,
            });

            if (_.isNil(body) || !_.isObject(body)) {
                console.log('❌ Invalid body type for UPSERT');
                throw new UnprocessableEntityException('Body must be a valid object');
            }

            const bodyKeys = Object.keys(body);
            console.log('📋 Body keys:', bodyKeys);

            // Primary key 체크
            const bodyContainsPrimaryKey = (factoryOption.primaryKeys ?? []).some((primaryKey) => bodyKeys.includes(primaryKey.name));
            if (bodyContainsPrimaryKey) {
                const primaryKeyNames = (factoryOption.primaryKeys ?? []).map((key) => key.name);
                console.log('❌ Primary key modification attempt in UPSERT:', { primaryKeyNames, bodyKeys });

                this.crudLogger.log(
                    `Cannot include value of primary key (primary key: ${primaryKeyNames.toLocaleString()}, body key: ${bodyKeys.toLocaleString()}`,
                );
                throw new UnprocessableEntityException('Cannot include value of primary key');
            }

            // 🎯 allowedParams 추출 (메서드별 우선, 전역 fallback)
            const allowedParams = methodOptions.allowedParams ?? crudOptions.allowedParams;
            console.log('🎯 Using allowedParams for UPSERT validation:', allowedParams);

            try {
                const transformed = plainToInstance(crudOptions.entity as unknown as ClassConstructor<EntityType>, body);
                console.log('📝 Transformed fields:', Object.keys(transformed as object));

                // Priority: method-specific > global > default (true for UPSERT)
                const skipMissingProperties = methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? true;
                console.log('⚙️ UPSERT validation options:', { skipMissingProperties, allowedParams });

                const errorList = await validate(transformed, {
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    forbidUnknownValues: false,
                    skipMissingProperties,
                });

                if (errorList.length > 0) {
                    console.log(
                        '❌ UPSERT validation failed:',
                        errorList.map((e) => ({
                            property: e.property,
                            constraints: e.constraints,
                            value: e.value,
                        })),
                    );
                    this.crudLogger.log(errorList, 'ValidationError');
                    throw new UnprocessableEntityException(errorList);
                }

                console.log('✅ UPSERT validation passed');
                return transformed;
            } catch (error) {
                console.log('💥 UPSERT validation error:', error);
                throw error;
            }
        }
    }

    return mixin(MixinInterceptor);
}
