import { mixin } from '@nestjs/common';
import { PickType } from '@nestjs/swagger';
import { getMetadataStorage } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';

import { capitalizeFirstLetter } from '../capitalize-first-letter';
import { globalMetadataCache } from './metadata-cache-manager';

import type { Type } from '@nestjs/common';
import type { MetadataStorage } from 'class-validator';
import type { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata';
import type { EntityType, Method } from '../interface';

export function CreateRequestDto(parentClass: EntityType, group: Method, allowedParams?: string[]): Type<unknown> {
    // 🚀 캐시에서 DTO 확인
    const cachedDto = globalMetadataCache.getDtoClass(parentClass, group, allowedParams);
    if (cachedDto) {
        return cachedDto;
    }

    const propertyNamesAppliedValidation = getPropertyNamesFromMetadata(parentClass, group, allowedParams);

    class PickClass extends PickType(parentClass as Type<EntityType>, propertyNamesAppliedValidation as Array<keyof EntityType>) {}
    const requestDto = mixin(PickClass);
    const dtoName = `${capitalizeFirstLetter(group)}${parentClass.name}Dto`;

    Object.defineProperty(requestDto, 'name', {
        value: dtoName,
    });

    // 🚀 캐시에 DTO 저장
    globalMetadataCache.setDtoClass(parentClass, group, allowedParams, requestDto);

    return requestDto;
}

export function getPropertyNamesFromMetadata(parentClass: EntityType, group: Method, allowedParams?: string[]): string[] {

    const metadataStorage: MetadataStorage = getMetadataStorage();

    // class-validator 메타데이터에서 검증 데코레이터가 있는 필드들 가져오기
    const getTargetValidationMetadatasArgs = [parentClass, null!, false, false];
    const targetMetadata: ReturnType<typeof metadataStorage.getTargetValidationMetadatas> = (
        metadataStorage.getTargetValidationMetadatas as (...args: unknown[]) => ValidationMetadata[]
    )(...getTargetValidationMetadatasArgs);

    const propertyNamesFromValidation = targetMetadata.map(({ propertyName }) => propertyName);

    // TypeORM 메타데이터에서 엔티티의 모든 컬럼들 가져오기
    const typeormMetadata = getMetadataArgsStorage();

    // 상속 트리를 고려해서 모든 컬럼 가져오기
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const getInheritanceTree = (target: Function): Function[] => {
        const result: Function[] = [target];
        let current = target;

        while (current.prototype && Object.getPrototypeOf(current.prototype).constructor !== Object) {
            current = Object.getPrototypeOf(current.prototype).constructor;
            result.unshift(current);
        }

        return result;
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const inheritanceTree = getInheritanceTree(parentClass as Function);

    // 상속 트리에 포함된 모든 컬럼들 찾기
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const columnList = typeormMetadata.columns.filter(({ target }) => inheritanceTree.includes(target as Function));

    // relation은 제외 (성능상 이유)
    const relationList = typeormMetadata.relations.filter(({ target }) => inheritanceTree.includes(target as Function));
    const relationPropertyNames = relationList.map((r) => r.propertyName);

    const propertyNamesFromColumns = columnList
        .filter((column) => !relationPropertyNames.includes(column.propertyName))
        .map(({ propertyName }) => propertyName);


    // 🎯 allowedParams 우선 보장 로직
    let finalPropertyNames: string[];

    if (allowedParams && allowedParams.length > 0) {
        // allowedParams에 포함된 모든 필드는 반드시 포함
        const guaranteedFields = new Set<string>(allowedParams);

        // 기존 검증 필드들과 TypeORM 컬럼 필드들도 추가
        propertyNamesFromValidation.forEach((field) => guaranteedFields.add(field));
        propertyNamesFromColumns.forEach((field) => guaranteedFields.add(field));

        finalPropertyNames = Array.from(guaranteedFields);

        // allowedParams에 있지만 entity에 없는 필드 경고
        const entityFields = new Set([...propertyNamesFromValidation, ...propertyNamesFromColumns]);
        const unknownParams = allowedParams.filter((param) => !entityFields.has(param));

        if (unknownParams.length > 0) {
            console.warn('⚠️ allowedParams contains fields not found in entity:', unknownParams);
        }
    } else {
        // allowedParams가 없으면 기존 로직 사용
        finalPropertyNames = [...new Set([...propertyNamesFromValidation, ...propertyNamesFromColumns])];
    }

    return finalPropertyNames;
}
