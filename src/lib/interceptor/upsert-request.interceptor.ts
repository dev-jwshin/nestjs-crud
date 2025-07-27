/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { Method } from '../interface';

import type { CrudOptions, CrudUpsertRequest, EntityType, FactoryOption } from '../interface';
import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

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

            const body = await this.validateBody(req.body ?? {});

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

        async validateBody(body: unknown) {
            if (_.isNil(body) || !_.isObject(body)) {
                throw new UnprocessableEntityException();
            }
            const bodyKeys = Object.keys(body);
            const bodyContainsPrimaryKey = (factoryOption.primaryKeys ?? []).some((primaryKey) => bodyKeys.includes(primaryKey.name));
            if (bodyContainsPrimaryKey) {
                this.crudLogger.log(
                    `Cannot include value of primary key (primary key: ${(
                        factoryOption.primaryKeys ?? []
                    ).map(key => key.name).toLocaleString()}, body key: ${bodyKeys.toLocaleString()}`,
                );
                throw new UnprocessableEntityException('Cannot include value of primary key');
            }

            const transformed = plainToInstance(crudOptions.entity as unknown as ClassConstructor<EntityType>, body);
            const errorList = await validate(transformed, { whitelist: true, forbidNonWhitelisted: false, forbidUnknownValues: false });

            if (errorList.length > 0) {
                this.crudLogger.log(errorList, 'ValidationError');
                throw new UnprocessableEntityException(errorList);
            }
            return transformed;
        }
    }

    return mixin(MixinInterceptor);
}
