import { mixin } from '@nestjs/common';
import _ from 'lodash';
import { LessThan, MoreThan } from 'typeorm';

import { RequestAbstractInterceptor } from '../abstract';
import { CRUD_ROUTE_ARGS, CUSTOM_REQUEST_OPTIONS } from '../constants';
import { CRUD_POLICY } from '../crud.policy';
import { Method, Sort, PaginationType } from '../interface';
import { PaginationHelper, QueryParser, QueryConverter } from '../provider';
import { CrudReadManyRequest } from '../request';

import type { CustomReadManyRequestOptions } from './custom-request.interceptor';
import type { CrudOptions, FactoryOption, EntityType, QueryParserOptions } from '../interface';
import type { CallHandler, ExecutionContext, NestInterceptor, Type } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { FindOptionsWhere } from 'typeorm';

const method = Method.INDEX;
export function ReadManyRequestInterceptor(crudOptions: CrudOptions, factoryOption: FactoryOption): Type<NestInterceptor> {
    class MixinInterceptor extends RequestAbstractInterceptor implements NestInterceptor {
        constructor() {
            super(factoryOption.logger);
        }

        async intercept(context: ExecutionContext, next: CallHandler<unknown>): Promise<Observable<unknown>> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const req: Record<string, any> = context.switchToHttp().getRequest<Request>();
            const readManyOptions = crudOptions.routes?.[method] ?? {};

            const customReadManyRequestOptions: CustomReadManyRequestOptions = req[CUSTOM_REQUEST_OPTIONS];
            const paginationType = (readManyOptions.paginationType ?? CRUD_POLICY[method].default.paginationType) as PaginationType;

            const requestQuery = req.query;
            if (Object.keys(req.params ?? {}).length > 0) {
                Object.assign(requestQuery, req.params);
            }

            // Create RESTful query parser with options
            // Priority: route-specific allowedFilters > global CrudOptions allowedFilters > undefined (block all filters)
            const allowedFilters = readManyOptions.allowedFilters || crudOptions.allowedFilters;
            // Priority: route-specific allowedIncludes > global CrudOptions allowedIncludes > undefined (block all includes)
            const allowedIncludes = readManyOptions.allowedIncludes || crudOptions.allowedIncludes;

            const queryParserOptions: QueryParserOptions = {
                allowedFilters,
                allowedSorts: factoryOption.columns?.map((col) => col.name),
                allowedIncludes,
                maxPageSize: 100,
                defaultPageSize: readManyOptions.numberOfTake ?? CRUD_POLICY[method].default.numberOfTake,
            };

            const queryParser = new QueryParser(queryParserOptions);
            const queryConverter = new QueryConverter();

            // Parse RESTful query parameters
            const parsedQuery = queryParser.parse(requestQuery);

            // Convert to TypeORM FindOptions
            const findOptions = queryConverter.convertToFindOptions(parsedQuery);

            // Handle cursor pagination
            const legacyQuery = (() => {
                if (parsedQuery.page?.type === 'cursor') {
                    const pagination = PaginationHelper.getPaginationRequest(paginationType, requestQuery);
                    if (PaginationHelper.isNextPage(pagination)) {
                        const isQueryValid = pagination.setQuery(pagination.query);
                        if (isQueryValid) {
                            return {};
                        }
                    }
                    pagination.setWhere(PaginationHelper.serialize({}));
                    return {};
                }
                return {};
            })();

            // Handle pagination - prefer new page params over legacy
            const pagination = parsedQuery.page
                ? this.convertPageOperationToPagination(parsedQuery.page, paginationType)
                : PaginationHelper.getPaginationRequest(paginationType, requestQuery);

            const withDeleted = _.isBoolean(customReadManyRequestOptions?.softDeleted)
                ? customReadManyRequestOptions.softDeleted
                : crudOptions.routes?.[method]?.softDelete ?? CRUD_POLICY[method].default.softDeleted;

            // Merge where conditions (legacy + new filters)
            const mergedWhere = { ...legacyQuery, ...findOptions.where };

            // Handle relations - prefer new includes over legacy
            const relations =
                parsedQuery.includes.length > 0
                    ? this.convertIncludesToStringArray(findOptions.relations)
                    : this.getRelations(customReadManyRequestOptions);

            // Handle sorting - prefer new sorts over legacy
            const sort =
                parsedQuery.sorts.length > 0
                    ? this.convertOrderToSort(findOptions.order)
                    : readManyOptions.sort
                        ? Sort[readManyOptions.sort]
                        : CRUD_POLICY[method].default.sort;

            const paginationKeys = readManyOptions.paginationKeys ?? factoryOption.primaryKeys.map(({ name }) => name);
            const numberOfTake =
                findOptions.take ??
                (pagination.type === 'cursor' ? readManyOptions.numberOfTake : pagination.limit ?? readManyOptions.numberOfTake) ??
                CRUD_POLICY[method].default.numberOfTake;

            const crudReadManyRequest: CrudReadManyRequest<typeof crudOptions.entity> = new CrudReadManyRequest<typeof crudOptions.entity>()
                .setPaginationKeys(paginationKeys)
                .setExcludeColumn(readManyOptions.exclude)
                .setPagination(pagination)
                .setWithDeleted(withDeleted)
                .setWhere(mergedWhere)
                .setTake(numberOfTake)
                .setSort(sort)
                .setRelations(relations)
                .setDeserialize(this.deserialize)
                .generate();

            this.crudLogger.logRequest(req, crudReadManyRequest.toString());
            req[CRUD_ROUTE_ARGS] = crudReadManyRequest;

            return next.handle();
        }



        getRelations(customReadManyRequestOptions: CustomReadManyRequestOptions): string[] {
            if (Array.isArray(customReadManyRequestOptions?.relations)) {
                return customReadManyRequestOptions.relations;
            }
            // 기본 관계포함 기능 제거 - include 파라미터가 없으면 관계 포함하지 않음
            return [];
        }

        deserialize<T>({ pagination, findOptions, sort }: CrudReadManyRequest<T>): FindOptionsWhere<T> {
            if (pagination.type === PaginationType.OFFSET) {
                return PaginationHelper.deserialize(pagination.where);
            }
            const query: Record<string, unknown> = PaginationHelper.deserialize(pagination.where);
            const lastObject: Record<string, unknown> = PaginationHelper.deserialize(pagination.nextCursor);

            const operator = (key: keyof T) => ((findOptions.order?.[key] ?? sort) === Sort.DESC ? LessThan : MoreThan);

            for (const [key, value] of Object.entries(lastObject)) {
                query[key] = operator(key as keyof T)(value);
            }
            return query as FindOptionsWhere<T>;
        }

        private convertPageOperationToPagination(page: any, paginationType: PaginationType) {
            // Convert new page format to existing pagination format
            switch (page.type) {
                case 'cursor': {
                    return PaginationHelper.getPaginationRequest(PaginationType.CURSOR, {
                        cursor: page.cursor,
                        limit: page.size,
                    });
                }
                case 'offset': {
                    return PaginationHelper.getPaginationRequest(PaginationType.OFFSET, {
                        offset: page.offset,
                        limit: page.limit,
                    });
                }
                case 'number': {
                    const offset = (page.number - 1) * page.size;
                    return PaginationHelper.getPaginationRequest(PaginationType.OFFSET, {
                        offset,
                        limit: page.size,
                    });
                }
                // No default
            }
            return PaginationHelper.getPaginationRequest(paginationType, {});
        }

        private convertIncludesToStringArray(relations: any): string[] {
            if (!relations) return [];

            if (Array.isArray(relations)) return relations;

            // Convert object relations to string array
            const result: string[] = [];
            const traverse = (obj: any, prefix = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    result.push(fullKey);

                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        traverse(value, fullKey);
                    }
                }
            };

            traverse(relations);
            return result;
        }

        private convertOrderToSort(order: any): Sort {
            if (!order) return CRUD_POLICY[method].default.sort;

            // For simplicity, just use the first sort field direction
            const firstKey = Object.keys(order)[0];
            if (firstKey && order[firstKey]) {
                const direction = String(order[firstKey]).toUpperCase();
                return direction === 'DESC' ? Sort.DESC : Sort.ASC;
            }

            return CRUD_POLICY[method].default.sort;
        }
    }

    return mixin(MixinInterceptor);
}
