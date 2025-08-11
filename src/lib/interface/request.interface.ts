import type { DeepPartial } from 'typeorm';
import type { LifecycleHooks, SaveOptions } from '.';

export type CrudRequestId<T> = keyof T | Array<keyof T>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CrudRequestBase {}

export interface CrudReadRequestBase extends CrudRequestBase {
    softDeleted?: boolean;
    relations: string[];
}

export interface CrudReadOneRequest<T> extends CrudReadRequestBase {
    selectColumns?: string[];
    excludedColumns?: string[];
    params: Partial<Record<keyof T, unknown>>;
}

export interface CrudCreateOneRequest<T> extends CrudRequestBase {
    body: DeepPartial<T>;
    exclude: Set<string>;
    saveOptions?: SaveOptions;
    hooks?: LifecycleHooks<T>;
}

export interface CrudCreateManyRequest<T> extends CrudRequestBase {
    body: Array<DeepPartial<T>>;
    exclude: Set<string>;
    saveOptions?: SaveOptions;
    hooks?: LifecycleHooks<T>;
}

export function isCrudCreateManyRequest<T>(x: CrudCreateOneRequest<T> | CrudCreateManyRequest<T>): x is CrudCreateManyRequest<T> {
    return Array.isArray(x.body);
}

export type CrudCreateRequest<T> = CrudCreateOneRequest<T> | CrudCreateManyRequest<T>;

export interface CrudUpsertRequest<T> extends CrudCreateOneRequest<T> {
    params: Partial<Record<keyof T, unknown>>;
    saveOptions: SaveOptions;
}

export interface CrudUpdateOneRequest<T> extends CrudCreateOneRequest<T> {
    params: Partial<Record<keyof T, unknown>>;
    saveOptions: SaveOptions;
}

export interface CrudDeleteOneRequest<T> extends CrudRequestBase {
    params: Partial<Record<keyof T, unknown>>;
    softDeleted: boolean;
    exclude: Set<string>;
    saveOptions: SaveOptions;
    hooks?: LifecycleHooks<T>;
}

export interface CrudRecoverRequest<T> extends CrudRequestBase {
    params: Partial<Record<keyof T, unknown>>;
    exclude: Set<string>;
    saveOptions: SaveOptions;
    hooks?: LifecycleHooks<T>;
}

// ========================================
// NEW: AllowedParams-based utility types
// ========================================

// Utility type to pick only allowed parameters from entity
export type CrudAllowedParams<T, K extends keyof T = keyof T> = Pick<T, K>;

// Type-safe request DTOs based on allowedParams - use these for @Body() parameters
export type CrudCreateRequestDto<T, AllowedKeys extends keyof T = keyof T> = Partial<CrudAllowedParams<T, AllowedKeys>>;

export type CrudUpdateRequestDto<T, AllowedKeys extends keyof T = keyof T> = Partial<CrudAllowedParams<T, AllowedKeys>>;

export type CrudUpsertRequestDto<T, AllowedKeys extends keyof T = keyof T> = Partial<CrudAllowedParams<T, AllowedKeys>>;

// Helper to create type-safe DTOs with literal array of allowed params
export type CreateCrudCreateRequestDto<T, AllowedParams extends readonly (keyof T)[]> = Pick<T, AllowedParams[number]>;

export type CreateCrudUpdateRequestDto<T, AllowedParams extends readonly (keyof T)[]> = Partial<Pick<T, AllowedParams[number]>>;

export type CreateCrudUpsertRequestDto<T, AllowedParams extends readonly (keyof T)[]> = Pick<T, AllowedParams[number]>;

// Runtime helper functions to filter request data based on allowedParams
export function filterAllowedCreateParams<T, K extends keyof T>(data: any, allowedParams: K[]): Pick<T, K> {
    if (!data || typeof data !== 'object') {
        return {} as Pick<T, K>;
    }

    const filtered = {} as Pick<T, K>;
    for (const key of allowedParams) {
        if (key in data) {
            (filtered as any)[key] = data[key];
        }
    }
    return filtered;
}

export function filterAllowedUpdateParams<T, K extends keyof T>(data: any, allowedParams: K[]): Partial<Pick<T, K>> {
    if (!data || typeof data !== 'object') {
        return {};
    }

    const filtered = {} as Partial<Pick<T, K>>;
    for (const key of allowedParams) {
        if (key in data) {
            (filtered as any)[key] = data[key];
        }
    }
    return filtered;
}

// Validation helper to ensure only allowed params are present
export function validateAllowedParams<T>(data: any, allowedParams: (keyof T)[]): { valid: boolean; invalidKeys: string[] } {
    if (!data || typeof data !== 'object') {
        return { valid: true, invalidKeys: [] };
    }

    const dataKeys = Object.keys(data);
    const allowedKeyStrings = allowedParams.map((key) => String(key));
    const invalidKeys = dataKeys.filter((key) => !allowedKeyStrings.includes(key));

    return {
        valid: invalidKeys.length === 0,
        invalidKeys,
    };
}
