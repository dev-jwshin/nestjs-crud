/* eslint-disable @typescript-eslint/no-explicit-any */
import { mixin, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS } from '../constants';
import { GROUP, Method } from '../interface';

import type { CrudOptions, CrudUpdateOneRequest, EntityType, FactoryOption } from '../interface';
import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { ClassConstructor } from 'class-transformer';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

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

            const body = await this.validateBody(req.body ?? {});

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
                throw new UnprocessableEntityException('Cannot changed value of primary key');
            }

            const transformed = plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body, { groups: [GROUP.UPDATE] });
            const errorList = await validate(transformed, {
                groups: [GROUP.UPDATE],
                whitelist: true,
                forbidNonWhitelisted: false,
                stopAtFirstError: true,
            });

            if (errorList.length > 0) {
                this.crudLogger.log(errorList, 'ValidationError');
                throw new UnprocessableEntityException(errorList);
            }
            return transformed;
        }
    }
    return mixin(MixinInterceptor);
}
