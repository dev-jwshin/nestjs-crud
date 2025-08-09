/* eslint-disable @typescript-eslint/no-explicit-any */
import { mixin, UnprocessableEntityException } from '@nestjs/common';
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
import type { CrudOptions, CrudUpdateOneRequest, EntityType, FactoryOption } from '../interface';

const method = Method.UPDATE;
export function UpdateRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            const req = context.switchToHttp().getRequest<Request>();
            const updatedOptions = crudOptions.routes?.[method] ?? {};

            // Filter body parameters based on allowedParams
            const allowedParams = updatedOptions.allowedParams ?? crudOptions.allowedParams;
            if (allowedParams && req.body && typeof req.body === 'object') {
                req.body = this.filterAllowedParams(req.body, allowedParams);
            }

            const body = await this.validateBody(req.body ?? {}, updatedOptions);

            const params = await this.checkParams(crudOptions.entity, req.params, factoryOption.columns);
            const crudUpdateOneRequest: CrudUpdateOneRequest<typeof crudOptions.entity> = {
                params,
                body,
                exclude: new Set(updatedOptions.exclude ?? []),
                saveOptions: {
                    listeners: updatedOptions.listeners,
                },
                hooks: updatedOptions.hooks,
            };

            this.crudLogger.logRequest(req, crudUpdateOneRequest);
            (req as unknown as Record<string, unknown>)[CRUD_ROUTE_ARGS] = crudUpdateOneRequest;

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
            console.log('🔍 UPDATE validateBody called with:', {
                bodyKeys: body && typeof body === 'object' ? Object.keys(body) : 'invalid body',
                methodOptions,
            });

            if (_.isNil(body) || !_.isObject(body)) {
                console.log('❌ Invalid body type for UPDATE');
                throw new UnprocessableEntityException('Body must be a valid object');
            }

            const bodyKeys = Object.keys(body);
            console.log('📋 Body keys:', bodyKeys);

            // Primary key 체크
            const bodyContainsPrimaryKey = (factoryOption.primaryKeys ?? []).some((primaryKey) => bodyKeys.includes(primaryKey.name));
            if (bodyContainsPrimaryKey) {
                const primaryKeyNames = (factoryOption.primaryKeys ?? []).map((key) => key.name);
                console.log('❌ Primary key modification attempt:', { primaryKeyNames, bodyKeys });

                this.crudLogger.log(
                    `Cannot include value of primary key (primary key: ${primaryKeyNames.toLocaleString()}, body key: ${bodyKeys.toLocaleString()}`,
                );
                throw new UnprocessableEntityException('Cannot changed value of primary key');
            }

            // 🎯 allowedParams 추출 (메서드별 우선, 전역 fallback)
            const allowedParams = methodOptions.allowedParams ?? crudOptions.allowedParams;
            console.log('🎯 Using allowedParams for UPDATE validation:', allowedParams);

            try {
                const transformed = plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body);
                console.log('📝 Transformed fields:', Object.keys(transformed as object));

                // Priority: method-specific > global > default (true for UPDATE)
                const skipMissingProperties = methodOptions.skipMissingProperties ?? crudOptions.skipMissingProperties ?? true;
                console.log('⚙️ UPDATE validation options:', { skipMissingProperties, allowedParams });

                const errorList = await validate(transformed, {
                    whitelist: true,
                    forbidNonWhitelisted: false,
                    forbidUnknownValues: false,
                    stopAtFirstError: true,
                    skipMissingProperties,
                });

                if (errorList.length > 0) {
                    console.log(
                        '❌ UPDATE validation failed:',
                        errorList.map((e) => ({
                            property: e.property,
                            constraints: e.constraints,
                            value: e.value,
                        })),
                    );
                    this.crudLogger.log(errorList, 'ValidationError');
                    throw new UnprocessableEntityException(errorList);
                }

                console.log('✅ UPDATE validation passed');
                return transformed;
            } catch (error) {
                console.log('💥 UPDATE validation error:', error);
                throw error;
            }
        }
    }
    return mixin(MixinInterceptor);
}
