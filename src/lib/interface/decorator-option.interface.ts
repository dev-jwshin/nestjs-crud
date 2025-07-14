import type { Method, Sort, PaginationType, Author, EntityType } from '.';
import type { NestInterceptor, Type } from '@nestjs/common';
import type { ColumnType } from 'typeorm';

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
             * @default false
             */
            relations?: false | string[];
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
        } & Omit<RouteBaseOption, 'response'>;

        [Method.CREATE]?: {
            swagger?: {
                /**
                 * Configures the Swagger documentation for the route's request body
                 */
                body?: Type<unknown>;
            };
            /**
             * Configures ways to save author information to the Entity after the operation completed.
             * It updates Entity's `author.property` field with respect to the value of `author.filter` from express's Request object.
             * If `author.filter` is not found in the Request object, author.value will be used as default.
             */
            author?: Author;
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
             * Configures ways to save author information to the Entity after the operation completed.
             *
             * It updates Entity's `author.property` field with respect to the value of `author.filter` from express's Request object.
             * If `author.filter` is not found in the Request object, author.value will be used as default.
             */
            author?: Author;
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
            /**
             * Configures ways to save author information to the Entity after the operation completed.
             *
             * It updates Entity's `author.property` field with respect to the value of `author.filter` from express's Request object.
             * If `author.filter` is not found in the Request object, author.value will be used as default.
             */
            author?: Author;
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
             * Configures ways to save author information to the Entity after the operation completed.
             *
             * It updates Entity's `author.property` field with respect to the value of `author.filter` from express's Request object.
             * If `author.filter` is not found in the Request object, author.value will be used as default.
             */
            author?: Author;
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
            /**
             * Configures ways to save author information to the Entity after the operation completed.
             *
             * It updates Entity's `author.property` field with respect to the value of `author.filter` from express's Request object.
             * If `author.filter` is not found in the Request object, author.value will be used as default.
             */
            author?: Author;
        } & RouteBaseOption &
        SaveOptions;
    };
    /**
     * An array of methods to generate routes for. If not specified, all routes will be generated.
     */
    only?: Array<Method | `${Method}`>;
}
