import { mixin } from '@nestjs/common';
import { PickType } from '@nestjs/swagger';
import { getMetadataStorage } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';

import { capitalizeFirstLetter } from '../capitalize-first-letter';

import type { EntityType, Method } from '../interface';
import type { Type } from '@nestjs/common';
import type { MetadataStorage } from 'class-validator';
import type { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata';

export function CreateRequestDto(parentClass: EntityType, group: Method): Type<unknown> {
    const propertyNamesAppliedValidation = getPropertyNamesFromMetadata(parentClass, group);

    class PickClass extends PickType(parentClass as Type<EntityType>, propertyNamesAppliedValidation as Array<keyof EntityType>) { }
    const requestDto = mixin(PickClass);
    Object.defineProperty(requestDto, 'name', {
        value: `${capitalizeFirstLetter(group)}${parentClass.name}Dto`,
    });

    return requestDto;
}

export function getPropertyNamesFromMetadata(parentClass: EntityType, group: Method): string[] {
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

    const propertyNamesFromColumns = columnList.map(({ propertyName }) => propertyName);

    // class-validator와 TypeORM 컬럼 메타데이터를 합쳐서 중복 제거
    const allPropertyNames = [
        ...new Set([
            ...propertyNamesFromValidation,
            ...propertyNamesFromColumns,
        ]),
    ];

    return allPropertyNames;
}
