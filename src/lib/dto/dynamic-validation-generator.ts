/**
 * 🎯 동적 검증 메타데이터 생성기
 * TypeORM Entity와 allowedParams를 기반으로 런타임에 검증 규칙을 생성
 * class-validator 데코레이터 없어도 allowedParams에 포함된 필드는 자동 검증
 */

import { plainToInstance } from 'class-transformer';
import { getMetadataStorage, validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';

import { debugValidationMetadata, generateValidationRulesFromColumn, isColumnOptional } from './column-type-validator-map';

import { globalMetadataCache } from './metadata-cache-manager';

import type { ClassConstructor } from 'class-transformer';
import type { ValidatorOptions } from 'class-validator';
import type { EntityType, Method } from '../interface';
import type { DynamicValidationMetadata, ValidationRule } from './column-type-validator-map';

/**
 * 🎯 Entity와 allowedParams를 기반으로 동적 검증 메타데이터 생성
 * @param entity TypeORM Entity 클래스
 * @param allowedParams 허용된 파라미터 목록
 * @param method CRUD 메서드 ('create', 'update', 'upsert')
 * @returns 동적 검증 메타데이터 배열
 */
export function generateDynamicValidationMetadata(
    entity: EntityType,
    allowedParams?: string[],
    method?: Method,
): DynamicValidationMetadata[] {
    // 🚀 고도화된 캐시에서 확인
    const cachedMetadata = globalMetadataCache.getValidationMetadata(entity, allowedParams, method);
    if (cachedMetadata) {
        return cachedMetadata;
    }


    const metadata: DynamicValidationMetadata[] = [];

    // 1. 기존 class-validator 메타데이터 수집
    const existingValidatorMetadata = getExistingValidatorMetadata(entity);

    // 2. TypeORM 컬럼 메타데이터 수집
    const typeormColumnMetadata = getTypeOrmColumnMetadata(entity);

    // 3. allowedParams 우선 처리: allowedParams에 포함된 모든 필드는 반드시 검증 대상
    if (allowedParams && allowedParams.length > 0) {
        for (const paramName of allowedParams) {
            // 3-1. 기존 validator가 있는지 확인
            const existingMeta = existingValidatorMetadata.find((m) => m.propertyName === paramName);
            if (existingMeta) {
                // 🚀 개선: TypeORM 정보로 isOptional 속성 보완
                const columnMeta = typeormColumnMetadata.find((c) => c.propertyName === paramName);
                if (columnMeta) {
                    const typeormIsOptional = isColumnOptional(columnMeta);
                    // TypeORM에서 optional이면 기존 메타데이터 override
                    if (typeormIsOptional && !existingMeta.isOptional) {
                        existingMeta.isOptional = true;
                    }
                } else {
                    // Keep empty else block for clarity
                }
                metadata.push(existingMeta);
                continue;
            }

            // 3-2. TypeORM 컬럼에서 검증 규칙 자동 생성
            const columnMeta = typeormColumnMetadata.find((c) => c.propertyName === paramName);
            if (columnMeta) {
                const rules = generateValidationRulesFromColumn(columnMeta);
                const isOptional = isColumnOptional(columnMeta);

                metadata.push({
                    propertyName: paramName,
                    rules,
                    isOptional,
                    target: entity,
                });

            } else {
                // 3-3. TypeORM 컬럼도 아니면 기본 문자열 검증
                metadata.push({
                    propertyName: paramName,
                    rules: [{ validator: 'isString', options: {} }],
                    isOptional: true, // 안전하게 optional로 처리
                    target: entity,
                });
            }
        }
    } else {
        // 4. allowedParams가 없으면 기존 class-validator 메타데이터만 사용
        metadata.push(...existingValidatorMetadata);
    }

    // 🚀 고도화된 캐시에 저장
    globalMetadataCache.setValidationMetadata(entity, allowedParams, method, metadata);

    // 디버깅 출력
    debugValidationMetadata(metadata);

    return metadata;
}

/**
 * 🔧 기존 class-validator 메타데이터 수집
 * @param entity Entity 클래스
 * @returns 기존 검증 메타데이터
 */
function getExistingValidatorMetadata(entity: EntityType): DynamicValidationMetadata[] {
    const metadataStorage = getMetadataStorage();
    const targetMetadata = metadataStorage.getTargetValidationMetadatas(entity as any, null!, false, false);

    // 프로퍼티별로 그룹화
    const groupedByProperty = new Map<string, any[]>();

    targetMetadata.forEach((meta) => {
        if (!groupedByProperty.has(meta.propertyName)) {
            groupedByProperty.set(meta.propertyName, []);
        }
        groupedByProperty.get(meta.propertyName)!.push(meta);
    });

    // DynamicValidationMetadata 형태로 변환
    const result: DynamicValidationMetadata[] = [];

    groupedByProperty.forEach((metas, propertyName) => {
        const rules: ValidationRule[] = [];
        let isOptional = false;

        metas.forEach((meta) => {
            // @IsOptional 체크
            if (meta.type === 'conditionalValidation' && meta.name === 'isOptional') {
                isOptional = true;
                return;
            }

            // 일반 검증 규칙들
            rules.push({
                validator: meta.name || meta.type,
                options: meta.constraints || {},
                message: meta.message,
            });
        });

        result.push({
            propertyName,
            rules,
            isOptional,
            target: entity,
        });
    });

    return result;
}

/**
 * 🔧 TypeORM 컬럼 메타데이터 수집 (상속 고려)
 * @param entity Entity 클래스
 * @returns TypeORM 컬럼 메타데이터
 */
function getTypeOrmColumnMetadata(entity: EntityType) {
    const typeormMetadata = getMetadataArgsStorage();

    // 상속 트리 고려
    const getInheritanceTree = (target: Function): Function[] => {
        const result: Function[] = [target];
        let current = target;

        while (current.prototype && Object.getPrototypeOf(current.prototype).constructor !== Object) {
            current = Object.getPrototypeOf(current.prototype).constructor;
            result.unshift(current);
        }

        return result;
    };

    const inheritanceTree = getInheritanceTree(entity as Function);

    // 상속 트리에 포함된 모든 컬럼들 찾기
    const columnList = typeormMetadata.columns.filter(({ target }) => inheritanceTree.includes(target as Function));

    // relation은 제외
    const relationList = typeormMetadata.relations.filter(({ target }) => inheritanceTree.includes(target as Function));

    const relationPropertyNames = relationList.map((r) => r.propertyName);

    return columnList.filter((column) => !relationPropertyNames.includes(column.propertyName));
}

/**
 * 🚀 동적 검증 메타데이터를 기반으로 객체 검증 수행
 * @param body 검증할 객체
 * @param metadata 동적 검증 메타데이터
 * @param options 검증 옵션
 * @returns 검증된 객체 또는 에러
 */
export async function validateWithDynamicMetadata<T extends object>(
    body: any,
    metadata: DynamicValidationMetadata[],
    entity: ClassConstructor<T>,
    options: ValidatorOptions = {},
): Promise<T> {
    if (!body || typeof body !== 'object') {
        throw new Error('Body must be an object');
    }


    // 1. plainToInstance로 기본 변환
    const transformed = plainToInstance(entity, body);

    // 2. 동적 검증 규칙 적용 (향후 구현)
    // 현재는 기본 class-validator 검증 사용
    const errorList = await validate(transformed, {
        whitelist: true,
        forbidNonWhitelisted: false,
        forbidUnknownValues: false,
        skipMissingProperties: options.skipMissingProperties ?? false,
        ...options,
    });


    if (errorList.length > 0) {
        throw errorList;
    }

    return transformed;
}

/**
 * 🧹 검증 메타데이터 캐시 초기화 (개발 모드에서 유용)
 */
export function clearValidationMetadataCache(): void {
    globalMetadataCache.clear();
}

/**
 * 📊 현재 캐시 상태 출력 (디버깅용)
 */
export function debugCacheStatus(): void {
    // Cache status debugging function - removed console output
}
