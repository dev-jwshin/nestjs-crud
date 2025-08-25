import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CRUD_OPTIONS_METADATA } from '../constants';
import { ExcludeFieldsUtil } from '../utils/exclude-fields.util';
import { CrudOptions } from '../interface';

/**
 * Interceptor to exclude fields from CRUD responses based on decorator options
 */
@Injectable()
export class ExcludeFieldsInterceptor implements NestInterceptor {
    constructor(private reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const controller = context.getClass();
        const handler = context.getHandler();
        
        // Get CRUD options from metadata
        const crudOptions: CrudOptions = this.reflector.get(
            CRUD_OPTIONS_METADATA,
            controller
        );

        if (!crudOptions) {
            return next.handle();
        }

        // Get route-specific exclude fields
        const routeName = handler.name;
        const routeExclude = this.getRouteExcludeFields(crudOptions, routeName);
        
        // Merge global and route-specific exclude fields
        const excludeFields = ExcludeFieldsUtil.mergeExcludeFields(
            crudOptions.exclude,
            routeExclude
        );

        if (!excludeFields || excludeFields.length === 0) {
            return next.handle();
        }

        // Apply field exclusion to response
        return next.handle().pipe(
            map(data => {
                // Handle both single responses and array responses
                if (data?.data) {
                    // CRUD response format
                    return {
                        ...data,
                        data: ExcludeFieldsUtil.exclude(data.data, excludeFields)
                    };
                }
                
                // Direct response
                return ExcludeFieldsUtil.exclude(data, excludeFields);
            })
        );
    }

    /**
     * Get route-specific exclude fields based on route name
     */
    private getRouteExcludeFields(options: CrudOptions, routeName: string): string[] | undefined {
        const routeMapping: Record<string, string> = {
            'handleShow': 'show',
            'handleIndex': 'index',
            'handleCreate': 'create',
            'handleUpdate': 'update',
            'handleUpsert': 'upsert',
            'handleDestroy': 'destroy',
            'handleRecover': 'recover'
        };

        const routeKey = routeMapping[routeName];
        if (!routeKey || !options.routes) {
            return undefined;
        }

        return (options.routes as any)[routeKey]?.exclude;
    }
}