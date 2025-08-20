import { mixin } from '@nestjs/common';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS, CUSTOM_REQUEST_OPTIONS } from '../constants';
import { Method } from '../interface';

import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CrudOptions, CrudRecoverRequest, CrudRecoverManyRequest, FactoryOption } from '../interface';

const method = Method.RECOVER;
export function RecoverRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const req: Record<string, any> = context.switchToHttp().getRequest<Request>();
            const recoverOptions = crudOptions.routes?.[method] ?? {};

            const customRequestOption = req[CUSTOM_REQUEST_OPTIONS];
            
            // Check for bulk recover (body.ids array)
            const isBulkRecover = req.body?.ids && Array.isArray(req.body.ids);
            
            if (isBulkRecover) {
                // Bulk recover handling
                const primaryKeyName = factoryOption.primaryKeys?.[0]?.name || 'id';
                const paramsArray = req.body.ids.map((id: any) => ({ [primaryKeyName]: id }));
                
                const crudRecoverManyRequest: CrudRecoverManyRequest<typeof crudOptions.entity> = {
                    params: paramsArray,
                    exclude: new Set(recoverOptions.exclude ?? []),
                    saveOptions: {
                        listeners: recoverOptions.listeners,
                    },
                    hooks: recoverOptions.hooks,
                };
                
                this.crudLogger.logRequest(req, crudRecoverManyRequest);
                req[CRUD_ROUTE_ARGS] = crudRecoverManyRequest;
            } else {
                // Single recover handling (existing logic)
                const params = await this.checkParams(crudOptions.entity, customRequestOption?.params ?? req.params, factoryOption.columns);
                const crudRecoverRequest: CrudRecoverRequest<typeof crudOptions.entity> = {
                    params,
                    exclude: new Set(recoverOptions.exclude ?? []),
                    saveOptions: {
                        listeners: recoverOptions.listeners,
                    },
                    hooks: recoverOptions.hooks,
                };

                this.crudLogger.logRequest(req, crudRecoverRequest);
                req[CRUD_ROUTE_ARGS] = crudRecoverRequest;
            }
            
            return next.handle();
        }
    }

    return mixin(MixinInterceptor);
}
