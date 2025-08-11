/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import _ from 'lodash';

import { createCrudArrayResponse, createCrudResponse, isCrudCreateManyRequest } from './interface';

import type { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';
import type {
    CrudArrayResponse,
    CrudCreateManyRequest,
    CrudCreateOneRequest,
    CrudDeleteOneRequest,
    CrudReadOneRequest,
    CrudRecoverRequest,
    CrudResponse,
    CrudUpdateOneRequest,
    CrudUpsertRequest,
    EntityType,
    HookContext,
    LifecycleHooks,
    Method,
} from './interface';
import type { CrudReadManyRequest } from './request';

const SUPPORTED_REPLICATION_TYPES = new Set(['mysql', 'mariadb', 'postgres', 'aurora-postgres', 'aurora-mysql']);

export class CrudService<T extends EntityType> {
    private primaryKey: string[];
    private columnNames: string[];
    private usableQueryRunner = false;

    constructor(public readonly repository: Repository<T>) {
        this.usableQueryRunner = SUPPORTED_REPLICATION_TYPES.has(this.repository.metadata.connection?.options.type);
        this.primaryKey = this.repository.metadata.primaryColumns?.map((columnMetadata) => columnMetadata.propertyName) ?? [];
        this.columnNames = this.repository.metadata.columns.map((column) => column.propertyPath);
    }

    readonly reservedIndex = async (crudReadManyRequest: CrudReadManyRequest<T>): Promise<CrudArrayResponse<T>> => {
        crudReadManyRequest.excludedColumns(this.columnNames);
        const { entities, total } = await (async () => {
            const findEntities = this.repository.find({ ...crudReadManyRequest.findOptions });

            if (crudReadManyRequest.pagination.isNext) {
                const entities = await findEntities;
                return { entities, total: crudReadManyRequest.pagination.nextTotal() };
            }
            const [entities, total] = await Promise.all([
                findEntities,
                this.repository.count({
                    where: crudReadManyRequest.findOptions.where,
                    withDeleted: crudReadManyRequest.findOptions.withDeleted,
                }),
            ]);
            return { entities, total };
        })();

        // Convert traditional pagination response to unified CRUD response
        const paginationResponse = crudReadManyRequest.toResponse(entities, total);
        const { data, metadata: paginationMetadata } = paginationResponse;

        // Transform entities to plain objects to apply @Exclude decorators
        const transformedData = this.transformEntityToPlain(data);

        // Determine pagination type and create metadata
        const paginationInfo: any = {
            total: paginationMetadata.total,
        };

        let paginationType: 'offset' | 'cursor';

        if ('page' in paginationMetadata) {
            // Offset pagination
            paginationType = 'offset';
            paginationInfo.page = paginationMetadata.page;
            paginationInfo.pages = paginationMetadata.pages;
            paginationInfo.offset = paginationMetadata.offset;
            paginationInfo.nextCursor = paginationMetadata.nextCursor;
        } else {
            // Cursor pagination
            paginationType = 'cursor';
            paginationInfo.limit = paginationMetadata.limit;
            paginationInfo.totalPages = paginationMetadata.totalPages;
            paginationInfo.nextCursor = paginationMetadata.nextCursor;
        }

        // Get additional metadata
        const includedRelations = crudReadManyRequest.findOptions.relations as string[] | undefined;

        return createCrudArrayResponse(transformedData, {
            pagination: {
                type: paginationType,
                ...paginationInfo,
            },
            includedRelations,
        });
    };

    readonly reservedShow = async (crudReadOneRequest: CrudReadOneRequest<T>): Promise<CrudResponse<T>> => {
        return this.repository
            .findOne({
                select: (crudReadOneRequest.selectColumns ?? this.columnNames).filter(
                    (columnName) => !crudReadOneRequest.excludedColumns?.includes(columnName),
                ),
                where: crudReadOneRequest.params as FindOptionsWhere<T>,
                withDeleted: crudReadOneRequest.softDeleted,
                relations: crudReadOneRequest.relations,
            })
            .then((entity) => {
                if (_.isNil(entity)) {
                    throw new NotFoundException();
                }
                // Transform entity to plain object to apply @Exclude decorators
                const transformedEntity = this.transformEntityToPlain(entity);
                return createCrudResponse(transformedEntity, {
                    includedRelations: crudReadOneRequest.relations,
                    excludedFields: crudReadOneRequest.excludedColumns ? [...crudReadOneRequest.excludedColumns] : undefined,
                });
            });
    };

    readonly reservedCreate = async (
        crudCreateRequest: CrudCreateOneRequest<T> | CrudCreateManyRequest<T>,
    ): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const isMany = isCrudCreateManyRequest<T>(crudCreateRequest);
        const bodyArray = isMany ? crudCreateRequest.body : [crudCreateRequest.body];

        // assignBefore 훅 실행
        const processedBodyArray = await Promise.all(
            bodyArray.map(async (body) => {
                const context: HookContext<T> = {
                    operation: 'create' as Method,
                    params: {},
                };
                return await this.executeAssignBeforeHook(crudCreateRequest.hooks, body, context);
            }),
        );

        // 엔티티 생성
        const entities = this.repository.create(processedBodyArray);

        // assignAfter 훅 실행
        for (let i = 0; i < entities.length; i++) {
            const context: HookContext<T> = {
                operation: 'create' as Method,
                params: {},
            };
            entities[i] = await this.executeAssignAfterHook(crudCreateRequest.hooks, entities[i], processedBodyArray[i], context);
        }

        // saveBefore 훅 실행
        for (let i = 0; i < entities.length; i++) {
            const context: HookContext<T> = {
                operation: 'create' as Method,
                params: {},
            };
            entities[i] = await this.executeSaveBeforeHook(crudCreateRequest.hooks, entities[i], context);
        }

        return this.repository
            .save(entities, crudCreateRequest.saveOptions)
            .then(async (result) => {
                // saveAfter 훅 실행
                for (let i = 0; i < result.length; i++) {
                    const context: HookContext<T> = {
                        operation: 'create' as Method,
                        params: {},
                    };
                    result[i] = await this.executeSaveAfterHook(crudCreateRequest.hooks, result[i], context);
                }

                const processedResult = isMany
                    ? result.map((entity) => this.excludeEntity(entity, crudCreateRequest.exclude))
                    : this.excludeEntity(result[0], crudCreateRequest.exclude);

                // Transform entities to plain objects to apply @Exclude decorators
                const transformedResult = this.transformEntityToPlain(processedResult);

                const excludedFields = crudCreateRequest.exclude.size > 0 ? [...crudCreateRequest.exclude] : undefined;

                return isMany
                    ? createCrudArrayResponse(transformedResult, { excludedFields })
                    : createCrudResponse(transformedResult, { excludedFields });
            })
            .catch(this.throwConflictException);
    };

    readonly reservedUpsert = async (crudUpsertRequest: CrudUpsertRequest<T>): Promise<CrudResponse<T>> => {
        return this.findOne(crudUpsertRequest.params as unknown as FindOptionsWhere<T>, true).then(async (entity: T | null) => {
            const isNew = entity === null;
            let upsertEntity = entity ?? this.repository.create(crudUpsertRequest.params as unknown as DeepPartial<T>);

            if ('deletedAt' in upsertEntity && upsertEntity.deletedAt != null) {
                throw new ConflictException('it has been deleted');
            }

            const context: HookContext<T> = {
                operation: 'upsert' as Method,
                params: crudUpsertRequest.params,
                currentEntity: entity ?? undefined,
            };

            // assignBefore 훅 실행
            const processedBody = await this.executeAssignBeforeHook(crudUpsertRequest.hooks, crudUpsertRequest.body, context);

            // 엔티티에 데이터 할당
            _.assign(upsertEntity, processedBody);

            // assignAfter 훅 실행
            upsertEntity = await this.executeAssignAfterHook(crudUpsertRequest.hooks, upsertEntity, processedBody, context);

            // saveBefore 훅 실행
            upsertEntity = await this.executeSaveBeforeHook(crudUpsertRequest.hooks, upsertEntity, context);

            return this.repository
                .save(upsertEntity, crudUpsertRequest.saveOptions)
                .then(async (savedEntity) => {
                    // saveAfter 훅 실행
                    savedEntity = await this.executeSaveAfterHook(crudUpsertRequest.hooks, savedEntity, context);

                    const processedEntity = this.excludeEntity(savedEntity, crudUpsertRequest.exclude);

                    // Transform entity to plain object to apply @Exclude decorators
                    const transformedEntity = this.transformEntityToPlain(processedEntity);
                    const excludedFields = crudUpsertRequest.exclude.size > 0 ? [...crudUpsertRequest.exclude] : undefined;

                    return createCrudResponse(transformedEntity, {
                        isNew,
                        excludedFields,
                    });
                })
                .catch(this.throwConflictException);
        });
    };

    readonly reservedUpdate = async (crudUpdateOneRequest: CrudUpdateOneRequest<T>): Promise<CrudResponse<T>> => {
        return this.findOne(crudUpdateOneRequest.params as unknown as FindOptionsWhere<T>, false).then(async (entity: T | null) => {
            if (!entity) {
                throw new NotFoundException();
            }

            const context: HookContext<T> = {
                operation: 'update' as Method,
                params: crudUpdateOneRequest.params,
                currentEntity: entity,
            };

            // 🚀 UPDATE 개선: body를 entity에 먼저 할당 후 beforeUpdate 훅에서 entity 처리
            // 1. body 데이터를 entity에 임시 할당
            _.assign(entity, crudUpdateOneRequest.body);

            // 2. assignBefore 훅 실행 (UPDATE의 경우 entity 기반)
            entity = await this.executeAssignBeforeHookForUpdate(crudUpdateOneRequest.hooks, entity, context);

            // assignAfter 훅 실행
            entity = await this.executeAssignAfterHook(crudUpdateOneRequest.hooks, entity, crudUpdateOneRequest.body, context);

            // saveBefore 훅 실행
            entity = await this.executeSaveBeforeHook(crudUpdateOneRequest.hooks, entity, context);

            return this.repository
                .save(entity, crudUpdateOneRequest.saveOptions)
                .then(async (updatedEntity) => {
                    // saveAfter 훅 실행
                    updatedEntity = await this.executeSaveAfterHook(crudUpdateOneRequest.hooks, updatedEntity, context);

                    const processedEntity = this.excludeEntity(updatedEntity, crudUpdateOneRequest.exclude);

                    // Transform entity to plain object to apply @Exclude decorators
                    const transformedEntity = this.transformEntityToPlain(processedEntity);
                    const excludedFields = crudUpdateOneRequest.exclude.size > 0 ? [...crudUpdateOneRequest.exclude] : undefined;

                    return createCrudResponse(transformedEntity, { excludedFields });
                })
                .catch(this.throwConflictException);
        });
    };

    readonly reservedDestroy = async (crudDeleteOneRequest: CrudDeleteOneRequest<T>): Promise<CrudResponse<T>> => {
        if (this.primaryKey.length === 0) {
            throw new ConflictException('cannot found primary key from entity');
        }
        return this.findOne(crudDeleteOneRequest.params as unknown as FindOptionsWhere<T>, false).then(async (entity: T | null) => {
            if (!entity) {
                throw new NotFoundException();
            }

            await (crudDeleteOneRequest.softDeleted
                ? this.repository.softRemove(entity, crudDeleteOneRequest.saveOptions)
                : this.repository.remove(entity, crudDeleteOneRequest.saveOptions));

            const processedEntity = this.excludeEntity(entity, crudDeleteOneRequest.exclude);

            // Transform entity to plain object to apply @Exclude decorators
            const transformedEntity = this.transformEntityToPlain(processedEntity);
            const excludedFields = crudDeleteOneRequest.exclude.size > 0 ? [...crudDeleteOneRequest.exclude] : undefined;

            return createCrudResponse(transformedEntity, {
                excludedFields,
                wasSoftDeleted: crudDeleteOneRequest.softDeleted,
            });
        });
    };

    readonly reservedRecover = async (crudRecoverRequest: CrudRecoverRequest<T>): Promise<CrudResponse<T>> => {
        return this.findOne(crudRecoverRequest.params as unknown as FindOptionsWhere<T>, true).then(async (entity: T | null) => {
            if (!entity) {
                throw new NotFoundException();
            }
            const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;

            await this.repository.recover(entity, crudRecoverRequest.saveOptions).catch(this.throwConflictException);

            const processedEntity = this.excludeEntity(entity, crudRecoverRequest.exclude);

            // Transform entity to plain object to apply @Exclude decorators
            const transformedEntity = this.transformEntityToPlain(processedEntity);
            const excludedFields = crudRecoverRequest.exclude.size > 0 ? [...crudRecoverRequest.exclude] : undefined;

            return createCrudResponse(transformedEntity, {
                excludedFields,
                wasSoftDeleted,
            });
        });
    };

    private async findOne(where: FindOptionsWhere<T>, withDeleted: boolean): Promise<T | null> {
        if (!this.usableQueryRunner) {
            return this.repository.findOne({ where, withDeleted });
        }
        const queryBuilder = this.repository.createQueryBuilder().where(where);
        if (withDeleted) {
            queryBuilder.withDeleted();
        }
        const runner = queryBuilder.connection.createQueryRunner('master');
        try {
            return await queryBuilder.setQueryRunner(runner).getOne();
        } finally {
            await runner.release();
        }
    }

    private excludeEntity(entity: T, exclude: Set<string>): T {
        if (exclude.size === 0) {
            return entity;
        }
        for (const excludeKey of exclude.values()) {
            delete entity[excludeKey as unknown as keyof T];
        }
        return entity;
    }

    /**
     * entity를 plain object로 변환하여 @Exclude 데코레이터를 적용합니다.
     */
    private transformEntityToPlain(entity: T | T[]): any {
        return instanceToPlain(entity);
    }

    private throwConflictException(error: Error): never {
        Logger.error(error);
        throw new ConflictException(error);
    }

    /**
     * 생명주기 훅을 실행하는 헬퍼 메서드들
     */
    private async executeAssignBeforeHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        body: DeepPartial<TEntity>,
        context: HookContext<TEntity>,
    ): Promise<DeepPartial<TEntity>> {
        if (!hooks?.assignBefore) {
            return body;
        }
        return await hooks.assignBefore(body, context);
    }

    /**
     * UPDATE 전용 assignBefore 훅 실행 - entity를 받아서 entity를 반환
     */
    private async executeAssignBeforeHookForUpdate<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        context: HookContext<TEntity>,
    ): Promise<TEntity> {
        if (!hooks?.assignBefore) {
            return entity;
        }

        // 🚀 UPDATE의 경우: assignBefore 훅에 entity를 전달하고 entity를 반환받음
        // 타입 캐스팅을 통해 entity 기반 처리 지원
        const result = await hooks.assignBefore(entity as any, context);

        // 결과가 entity인지 확인하고 반환
        return (result as TEntity) || entity;
    }

    private async executeAssignAfterHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        body: DeepPartial<TEntity>,
        context: HookContext<TEntity>,
    ): Promise<TEntity> {
        if (!hooks?.assignAfter) {
            return entity;
        }
        return await hooks.assignAfter(entity, body, context);
    }

    private async executeSaveBeforeHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        context: HookContext<TEntity>,
    ): Promise<TEntity> {
        if (!hooks?.saveBefore) {
            return entity;
        }
        return await hooks.saveBefore(entity, context);
    }

    private async executeSaveAfterHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        context: HookContext<TEntity>,
    ): Promise<TEntity> {
        if (!hooks?.saveAfter) {
            return entity;
        }
        return await hooks.saveAfter(entity, context);
    }
}
