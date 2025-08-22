/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any */
import { CRUD_OPTIONS_METADATA } from '../constants';
import type { CrudOptions, PaginationOptions } from '../interface';

type Constructor = new (...args: any[]) => any;

// 체이닝 가능한 데코레이터들을 위한 메타데이터 키
const CRUD_ENTITY_METADATA = 'crud:entity';
const CRUD_PARAMS_METADATA = 'crud:params';
const CRUD_FILTERS_METADATA = 'crud:filters';
const CRUD_EXCLUDE_METADATA = 'crud:exclude';
const CRUD_INCLUDES_METADATA = 'crud:includes';
const CRUD_PAGINATION_METADATA = 'crud:pagination';
const CRUD_SOFT_DELETE_METADATA = 'crud:softDelete';

/**
 * 엔티티를 설정하는 데코레이터
 */
export const CrudEntity = (entity: any) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_ENTITY_METADATA, entity, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 허용된 파라미터를 설정하는 데코레이터
 */
export const CrudParams = (params: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_PARAMS_METADATA, params, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 허용된 필터를 설정하는 데코레이터
 */
export const CrudFilters = (filters: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_FILTERS_METADATA, filters, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 제외할 필드를 설정하는 데코레이터
 */
export const CrudExclude = (fields: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_EXCLUDE_METADATA, fields, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 포함할 관계를 설정하는 데코레이터
 */
export const CrudIncludes = (includes: string[]) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_INCLUDES_METADATA, includes, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 페이지네이션 설정을 하는 데코레이터
 */
export const CrudPagination = (options: PaginationOptions) => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_PAGINATION_METADATA, options, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 소프트 삭제를 활성화하는 데코레이터
 */
export const CrudSoftDelete = () => <T extends Constructor>(target: T) => {
    Reflect.defineMetadata(CRUD_SOFT_DELETE_METADATA, true, target);
    updateCrudOptions(target);
    return target;
};

/**
 * 체이닝 데코레이터들의 메타데이터를 합쳐서 CrudOptions를 업데이트
 */
function updateCrudOptions<T extends Constructor>(target: T): void {
    const entity = Reflect.getMetadata(CRUD_ENTITY_METADATA, target);
    const allowedParams = Reflect.getMetadata(CRUD_PARAMS_METADATA, target);
    const allowedFilters = Reflect.getMetadata(CRUD_FILTERS_METADATA, target);
    const excludeFields = Reflect.getMetadata(CRUD_EXCLUDE_METADATA, target);
    const allowedIncludes = Reflect.getMetadata(CRUD_INCLUDES_METADATA, target);
    const pagination = Reflect.getMetadata(CRUD_PAGINATION_METADATA, target);
    const softDelete = Reflect.getMetadata(CRUD_SOFT_DELETE_METADATA, target);

    // 기존 CrudOptions가 있다면 가져오기
    const existingOptions: CrudOptions = Reflect.getMetadata(CRUD_OPTIONS_METADATA, target) || {};

    // 새로운 옵션 구성
    const newOptions: CrudOptions = {
        ...existingOptions,
        ...(entity && { entity }),
        ...(allowedParams && { allowedParams }),
        ...(allowedFilters && { allowedFilters }),
        ...(allowedIncludes && { allowedIncludes }),
        ...(pagination && { pagination }),
        ...(softDelete && { softDelete }),
    };

    // exclude 필드 처리
    if (excludeFields) {
        newOptions.routes = {
            ...newOptions.routes,
            create: { ...newOptions.routes?.create, exclude: excludeFields },
            update: { ...newOptions.routes?.update, exclude: excludeFields },
            upsert: { ...newOptions.routes?.upsert, exclude: excludeFields },
            show: { ...newOptions.routes?.show, exclude: excludeFields },
            index: { ...newOptions.routes?.index, exclude: excludeFields },
        };
    }

    // 업데이트된 옵션을 메타데이터에 저장
    Reflect.defineMetadata(CRUD_OPTIONS_METADATA, newOptions, target);
}

/**
 * 체이닝 데코레이터들로부터 완전한 CrudOptions를 빌드
 */
export function buildCrudOptionsFromChaining<T extends Constructor>(target: T): CrudOptions | undefined {
    // 메타데이터가 존재하는지 확인
    const hasChainMetadata = [
        CRUD_ENTITY_METADATA,
        CRUD_PARAMS_METADATA,
        CRUD_FILTERS_METADATA,
        CRUD_EXCLUDE_METADATA,
        CRUD_INCLUDES_METADATA,
        CRUD_PAGINATION_METADATA,
        CRUD_SOFT_DELETE_METADATA,
    ].some(key => Reflect.hasMetadata(key, target));

    if (!hasChainMetadata) {
        return undefined;
    }

    return Reflect.getMetadata(CRUD_OPTIONS_METADATA, target);
}