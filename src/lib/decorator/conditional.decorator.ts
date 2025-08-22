/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any */
import { CRUD_OPTIONS_METADATA } from '../constants';
import type { CrudOptions, PaginationOptions } from '../interface';

type Constructor = new (...args: any[]) => any;

// 조건부 데코레이터들을 위한 메타데이터 키
const CRUD_ROLES_METADATA = 'crud:roles';
const CRUD_CACHE_METADATA = 'crud:cache';
const CRUD_SERIALIZATION_METADATA = 'crud:serialization';
const CRUD_RESPONSE_FORMAT_METADATA = 'crud:responseFormat';
const CRUD_AUTO_INCLUDE_METADATA = 'crud:autoInclude';

/**
 * 역할 기반 필터링을 설정하는 데코레이터
 */
export const CrudRoles = (roles: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_ROLES_METADATA, roles, target);
    updateConditionalCrudOptions(target);
    return target;
};

/**
 * 캐시 설정을 하는 데코레이터
 */
export interface CacheOptions {
    ttl?: number;
    key?: string;
    layers?: Array<{
        type: 'memory' | 'redis' | 'database';
        ttl: number;
    }>;
    invalidation?: 'smart' | 'manual';
}

export const CrudCache = (options: CacheOptions) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_CACHE_METADATA, options, target);
    updateConditionalCrudOptions(target);
    return target;
};

/**
 * 직렬화 설정을 하는 데코레이터
 */
export interface SerializationOptions {
    [role: string]: string[];
}

export const CrudSerialize = (options: SerializationOptions) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_SERIALIZATION_METADATA, options, target);
    updateConditionalCrudOptions(target);
    return target;
};

/**
 * 응답 포맷을 설정하는 데코레이터
 */
export type ResponseFormat = 'json-api' | 'hal' | 'odata' | 'default';

export const CrudResponseFormat = (format: ResponseFormat) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_RESPONSE_FORMAT_METADATA, format, target);
    updateConditionalCrudOptions(target);
    return target;
};

/**
 * 자동 관계 포함을 설정하는 데코레이터
 */
export const AutoInclude = (relations: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_AUTO_INCLUDE_METADATA, relations, target);
    updateConditionalCrudOptions(target);
    return target;
};

/**
 * 페이지네이션 설정을 위한 향상된 데코레이터
 */
export interface EnhancedPaginationOptions extends PaginationOptions {
    maxLimit?: number;
    defaultLimit?: number;
}

export const CrudPaginationEnhanced = (options: EnhancedPaginationOptions) => <T extends Constructor>(target: T) => {
    const crudOptions: CrudOptions = Reflect.getMetadata(CRUD_OPTIONS_METADATA, target) || {};
    
    const updatedOptions: CrudOptions = {
        ...crudOptions,
        pagination: {
            ...crudOptions.pagination,
            ...options,
        },
    };

    Reflect.defineMetadata(CRUD_OPTIONS_METADATA, updatedOptions, target);
    return target;
};

/**
 * 조건부 데코레이터들의 메타데이터를 합쳐서 CrudOptions를 업데이트
 */
function updateConditionalCrudOptions<T extends Constructor>(target: T): void {
    const roles = Reflect.getMetadata(CRUD_ROLES_METADATA, target);
    const cache = Reflect.getMetadata(CRUD_CACHE_METADATA, target);
    const serialization = Reflect.getMetadata(CRUD_SERIALIZATION_METADATA, target);
    const responseFormat = Reflect.getMetadata(CRUD_RESPONSE_FORMAT_METADATA, target);
    const autoInclude = Reflect.getMetadata(CRUD_AUTO_INCLUDE_METADATA, target);

    // 기존 CrudOptions가 있다면 가져오기
    const existingOptions: CrudOptions = Reflect.getMetadata(CRUD_OPTIONS_METADATA, target) || {};

    // 새로운 옵션 구성 (확장 속성들)
    const newOptions: CrudOptions & {
        roles?: string[];
        cache?: CacheOptions;
        serialization?: SerializationOptions;
        responseFormat?: ResponseFormat;
        autoInclude?: string[];
    } = {
        ...existingOptions,
        ...(roles && { roles }),
        ...(cache && { cache }),
        ...(serialization && { serialization }),
        ...(responseFormat && { responseFormat }),
        ...(autoInclude && { autoInclude }),
    };

    // 업데이트된 옵션을 메타데이터에 저장
    Reflect.defineMetadata(CRUD_OPTIONS_METADATA, newOptions, target);
}

/**
 * 조건부 데코레이터들로부터 확장된 CrudOptions를 빌드
 */
export function buildConditionalCrudOptions<T extends Constructor>(target: T): CrudOptions & {
    roles?: string[];
    cache?: CacheOptions;
    serialization?: SerializationOptions;
    responseFormat?: ResponseFormat;
    autoInclude?: string[];
} {
    return Reflect.getMetadata(CRUD_OPTIONS_METADATA, target) || {};
}