import { mixin } from '@nestjs/common';
import _ from 'lodash';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS, CUSTOM_REQUEST_OPTIONS } from '../constants';
import { CRUD_POLICY } from '../crud.policy';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CrudDeleteOneRequest, CrudDeleteManyRequest, CrudOptions, FactoryOption } from '../interface';
import type { CustomDeleteRequestOptions } from './custom-request.interceptor';

const method = Method.DESTROY;
export function DeleteRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const req: Record<string, any> = context.switchToHttp().getRequest<Request>();
            const deleteOptions = crudOptions.routes?.[method] ?? {};
            const customDeleteRequestOptions: CustomDeleteRequestOptions = req[CUSTOM_REQUEST_OPTIONS];

            const softDeleted = _.isBoolean(customDeleteRequestOptions?.softDeleted)
                ? customDeleteRequestOptions.softDeleted
                : deleteOptions.softDelete ?? CRUD_POLICY[method].default.softDeleted;

            // Check for bulk delete (either body.ids array, query.ids, or ID is "bulk")
            const isBulkDelete = (req.body?.ids && Array.isArray(req.body.ids)) || req.params?.id === 'bulk';
            const queryIds = req.query?.ids;
            const hasQueryIds = queryIds && (typeof queryIds === 'string' || Array.isArray(queryIds));
            
            if (isBulkDelete || hasQueryIds) {
                // Bulk delete handling
                let ids: any[] = [];
                
                if (isBulkDelete) {
                    ids = req.body.ids;
                } else if (hasQueryIds) {
                    ids = typeof queryIds === 'string' ? queryIds.split(',') : queryIds;
                }
                
                const primaryKeyName = factoryOption.primaryKeys?.[0]?.name || 'id';
                const paramsArray = ids.map(id => ({ [primaryKeyName]: id }));
                
                const crudDeleteManyRequest: CrudDeleteManyRequest<typeof crudOptions.entity> = {
                    params: paramsArray,
                    softDeleted,
                    exclude: new Set(deleteOptions.exclude ?? []),
                    saveOptions: {
                        listeners: deleteOptions.listeners,
                    },
                };
                
                this.crudLogger.logRequest(req, crudDeleteManyRequest);
                req[CRUD_ROUTE_ARGS] = crudDeleteManyRequest;
            } else {
                // Single delete handling (existing logic)
                const params = await this.checkParams(crudOptions.entity, req.params, factoryOption.columns);
                const crudDeleteOneRequest: CrudDeleteOneRequest<typeof crudOptions.entity> = {
                    params,
                    softDeleted,
                    exclude: new Set(deleteOptions.exclude ?? []),
                    saveOptions: {
                        listeners: deleteOptions.listeners,
                    },
                };

                this.crudLogger.logRequest(req, crudDeleteOneRequest);
                req[CRUD_ROUTE_ARGS] = crudDeleteOneRequest;
            }

            return next.handle();
        }
    }

    return mixin(MixinInterceptor);
}
