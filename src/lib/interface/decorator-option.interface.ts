/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Method, Sort, PaginationType, EntityType } from '.';
import type { NestInterceptor, Type } from '@nestjs/common';
import type { ColumnType, DeepPartial } from 'typeorm';

interface RouteBaseOption {
    /**
     * An array of decorators to apply to the route handler
     */
    decorators?: Array<PropertyDecorator | MethodDecorator>;
    /**
     * An array of interceptors to apply to the route handler
     */
    interceptors?: Array<Type<NestInterceptor>>;
    /**
     * Configures the Swagger documentation for the route
     */
    swagger?: {
        /**
         * If set to true, the route will not be included in the Swagger documentation
         */
        hide?: boolean;
        /**
         * Configures the Swagger documentation for the route's response
         */
        response?: Type<unknown>;
        /**
         * Configures the Swagger documentation for the route's request body
         */
        body?: Type<unknown>;
    };
    /**
     * Configures the keys of entity to exclude from the route's response
     */
    exclude?: string[];
}

export interface SaveOptions {
    /**
     * Indicates if listeners and subscribers are called for this operation.
     * By default they are enabled, you can disable them by setting `{ listeners: false }` in save/remove options.
     * refer to typeorm’s save option.
     */
    listeners?: boolean;
}

export interface PrimaryKey {
    name: string;
    type?: ColumnType;
}

/**
 * See `crud.policy.ts` to check default values.
 */
export interface CrudOptions {
    /**
     * Entity class which CRUD operations will be performed
     */
    entity: EntityType;

    /**
     * enable Debug logging
     * @default false
     */
    logging?: boolean;

    /**
     * Array of column names that are allowed to be filtered.
     * If not specified, no columns can be filtered (all filters are blocked).
     * @example ['name', 'email', 'age']
     */
    allowedFilters?: string[];

    /**
     * Array of column names that are allowed in request parameters.
     * If not specified, no columns can be used in request parameters (all params are blocked).
     * Only applies to CREATE, UPDATE, and UPSERT operations.
     * @example ['name', 'email', 'age']
     */
    allowedParams?: string[];

    /**
     * Array of relation names that are allowed to be included via include query parameter.
     * If not specified, no relations can be included (all includes are blocked).
     * @example ['department', 'posts', 'posts.comments']
     */
    allowedIncludes?: string[];

    /**
     * Configures each CRUD method
     */
    routes?: {
        [Method.SHOW]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            /**
             * If set to true, soft-deleted entity could be included in the result.
             * @default false
             */
            softDelete?: boolean;
            /**
             * @deprecated 이 옵션은 더 이상 사용되지 않습니다. allowedIncludes를 사용하세요.
             * @default false
             */
            relations?: false | string[];
            /**
             * Array of column names that are allowed to be filtered.
             * If not specified, uses the global allowedFilters from CrudOptions.
             * If both are not specified, no columns can be filtered.
             * @example ['name', 'email', 'age']
             */
            allowedFilters?: string[];
            /**
             * Array of relation names that are allowed to be included via include query parameter.
             * If not specified, uses the global allowedIncludes from CrudOptions.
             * If both are not specified, no relations can be included.
             * @example ['department', 'posts', 'posts.comments']
             */
            allowedIncludes?: string[];
        } & RouteBaseOption;
        [Method.INDEX]?: {
            /**
             * Way to order the result
             * @default Sort.ASC
             */
            sort?: Sort | `${Sort}`;
            /**
             * Type of pagination to use. Currently 'offset' and 'cursor' are supported.
             * @default PaginationType.CURSOR
             */
            paginationType?: PaginationType | `${PaginationType}`;
            /**
             * Max number of entities should be taken.
             * @default 100
             */
            numberOfTake?: number;
            /**
             * @deprecated 이 옵션은 더 이상 사용되지 않습니다. allowedIncludes를 사용하세요.
             * What relations of entity should be loaded.
             * If set to false or an empty array, no relations will be loaded.
             * @default false
             */
            relations?: false | string[];
            /**
             * If set to true, soft-deleted entity could be included in the result.
             * @default true
             */
            softDelete?: boolean;
            /**
             * Keys to use for pagination.
             * If not set, the keys will be taken from the entity's primary keys.
             */
            paginationKeys?: string[];
            /**
             * Array of column names that are allowed to be filtered.
             * If not specified, uses the global allowedFilters from CrudOptions.
             * If both are not specified, no columns can be filtered.
             * @example ['name', 'email', 'age']
             */
            allowedFilters?: string[];
            /**
             * Array of relation names that are allowed to be included via include query parameter.
             * If not specified, uses the global allowedIncludes from CrudOptions.
             * If both are not specified, no relations can be included.
             * @example ['department', 'posts', 'posts.comments']
             */
            allowedIncludes?: string[];
        } & Omit<RouteBaseOption, 'response'>;

        [Method.CREATE]?: {
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };

            /**
             * 생명주기 훅 함수들을 설정합니다.
             */
            hooks?: LifecycleHooks;

            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];
        } & RouteBaseOption &
        SaveOptions;
        [Method.UPDATE]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`.
             */
            params?: string[];
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };
            /**
             * 생명주기 훅 함수들을 설정합니다.
             */
            hooks?: LifecycleHooks;
            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];
        } & RouteBaseOption &
        SaveOptions;
        [Method.DESTROY]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            /**
             * If set to true, the entity will be soft deleted. (Records the delete date of the entity)
             * @default true
             */
            softDelete?: boolean;
        } & RouteBaseOption &
        SaveOptions;
        [Method.UPSERT]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };
            /**
             * 생명주기 훅 함수들을 설정합니다.
             */
            hooks?: LifecycleHooks;
            /**
             * Array of column names that are allowed in request parameters.
             * If not specified, uses the global allowedParams from CrudOptions.
             * If both are not specified, no columns can be used in request parameters.
             * @example ['name', 'email', 'age']
             */
            allowedParams?: string[];
        } & RouteBaseOption &
        SaveOptions;
        [Method.RECOVER]?: {
            /**
             * Array of path parameters to use for the route
             *
             * @example
             * ```ts
             * params: ['id', 'subId']
             * ```
             * It will generate the route `/:id/:subId`
             */
            params?: string[];
        } & RouteBaseOption &
        SaveOptions;
    };
    /**
     * An array of methods to generate routes for. If not specified, all routes will be generated.
     */
    only?: Array<Method | `${Method}`>;
}

/**
 * 생명주기 훅 컨텍스트 정보
 */
export interface HookContext<T = any> {
    /**
     * 현재 실행 중인 CRUD 작업 타입
     */
    operation: Method;
    /**
     * 요청 파라미터 (예: { id: 1 })
     */
    params?: Record<string, any>;
    /**
     * 현재 엔티티 (update, upsert 시에만 제공)
     */
    currentEntity?: T;
    /**
     * 요청 객체에서 추가 정보
     */
    request?: any;
}

/**
 * 생명주기 훅 함수 타입 정의
 */
export interface LifecycleHooks<T = any> {
    /**
     * 모델에 데이터를 할당하기 전에 실행됩니다.
     * body 데이터를 수정하거나 검증할 수 있습니다.
     */
    assignBefore?: (body: DeepPartial<T>, context: HookContext<T>) => Promise<DeepPartial<T>> | DeepPartial<T>;

    /**
     * 모델에 데이터를 할당한 후에 실행됩니다.
     * 생성된 엔티티를 추가로 수정할 수 있습니다.
     */
    assignAfter?: (entity: T, body: DeepPartial<T>, context: HookContext<T>) => Promise<T> | T;

    /**
     * 데이터베이스에 저장하기 전에 실행됩니다.
     * 최종 검증이나 추가 처리를 할 수 있습니다.
     */
    saveBefore?: (entity: T, context: HookContext<T>) => Promise<T> | T;

    /**
     * 데이터베이스에 저장한 후에 실행됩니다.
     * 후처리나 이벤트 발생 등을 할 수 있습니다.
     */
    saveAfter?: (entity: T, context: HookContext<T>) => Promise<T> | T;
}
