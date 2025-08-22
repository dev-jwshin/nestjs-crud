/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import _ from 'lodash';
import { In } from 'typeorm';

import { 
    createCrudArrayResponse, 
    createCrudResponse, 
    isCrudCreateManyRequest,
    isCrudUpdateManyRequest,
    isCrudUpsertManyRequest,
    isCrudDeleteManyRequest,
    isCrudRecoverManyRequest
} from './interface';
import { ResponseFactory } from './utils/response-factory';
import { BatchProcessor } from './utils/batch-processor';

import type { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';
import type {
    CrudArrayResponse,
    CrudCreateManyRequest,
    CrudCreateOneRequest,
    CrudDeleteOneRequest,
    CrudDeleteManyRequest,
    CrudReadOneRequest,
    CrudRecoverRequest,
    CrudRecoverManyRequest,
    CrudResponse,
    CrudUpdateOneRequest,
    CrudUpdateManyRequest,
    CrudUpsertRequest,
    CrudUpsertManyRequest,
    EntityType,
    HookContext,
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

    readonly handleIndex = async (crudReadManyRequest: CrudReadManyRequest<T>): Promise<CrudArrayResponse<T>> => {
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

    readonly handleShow = async (crudReadOneRequest: CrudReadOneRequest<T>): Promise<CrudResponse<T>> => {
        // 1. Hook context 생성
        const context: HookContext<T> = {
            operation: 'show' as Method,
            params: crudReadOneRequest.params,
        };

        // 2. No configuration-based hooks anymore
        const processedParams = crudReadOneRequest.params;

        // 3. 엔티티 조회
        const entity = await this.repository.findOne({
            select: (crudReadOneRequest.selectColumns ?? this.columnNames).filter(
                (columnName) => !crudReadOneRequest.excludedColumns?.includes(columnName),
            ),
            where: processedParams as FindOptionsWhere<T>,
            withDeleted: crudReadOneRequest.softDeleted,
            relations: crudReadOneRequest.relations,
        });

        if (_.isNil(entity)) {
            throw new NotFoundException();
        }

        // 4. No configuration-based hooks anymore
        const processedEntity = entity;

        // 5. Transform entity to plain object to apply @Exclude decorators
        const transformedEntity = this.transformEntityToPlain(processedEntity);
        
        return createCrudResponse(transformedEntity, {
            includedRelations: crudReadOneRequest.relations,
            excludedFields: crudReadOneRequest.excludedColumns ? [...crudReadOneRequest.excludedColumns] : undefined,
        });
    };

    readonly handleCreate = async (
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
                return body;
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
            // No configuration-based hooks
        }

        // saveBefore 훅 실행
        for (let i = 0; i < entities.length; i++) {
            const context: HookContext<T> = {
                operation: 'create' as Method,
                params: {},
            };
            // No configuration-based hooks
        }

        // Process in batches for large datasets
        const saveEntities = async (entitiesToSave: T[]) => {
            if (isMany && entitiesToSave.length > BatchProcessor.DEFAULT_BATCH_SIZE) {
                // Use batch processing for large bulk operations
                const batchSize = BatchProcessor.getOptimalBatchSize(entitiesToSave.length);
                return BatchProcessor.processBatches(
                    entitiesToSave,
                    (batch) => this.repository.save(batch, crudCreateRequest.saveOptions),
                    batchSize
                );
            } else {
                // Regular save for small operations
                return this.repository.save(entitiesToSave, crudCreateRequest.saveOptions);
            }
        };
        
        return saveEntities(entities)
            .then(async (result) => {
                // saveAfter 훅 실행
                for (let i = 0; i < result.length; i++) {
                    const context: HookContext<T> = {
                        operation: 'create' as Method,
                        params: {},
                    };
                    // No configuration-based hooks
                }

                const processedResult = isMany
                    ? result.map((entity) => this.excludeEntity(entity, crudCreateRequest.exclude))
                    : this.excludeEntity(result[0], crudCreateRequest.exclude);

                // Use ResponseFactory for optimized transformation
                const excludedFields = crudCreateRequest.exclude.size > 0 ? [...crudCreateRequest.exclude] : undefined;
                
                return ResponseFactory.createResponse(processedResult, { excludedFields });
            })
            .catch(this.throwConflictException);
    };

    readonly handleUpsert = async (
        crudUpsertRequest: CrudUpsertRequest<T> | CrudUpsertManyRequest<T>,
    ): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const isMany = isCrudUpsertManyRequest<T>(crudUpsertRequest);
        
        if (isMany) {
            // Bulk upsert handling
            const upsertPromises = crudUpsertRequest.body.map(async (item) => {
                // Try to find existing entity based on primary key if present
                let entity: T | null = null;
                let params: Partial<Record<keyof T, unknown>> = {};
                
                // Check if item has primary key
                if (this.primaryKey.length > 0 && this.primaryKey[0] in item) {
                    params = { [this.primaryKey[0]]: (item as any)[this.primaryKey[0]] } as Partial<Record<keyof T, unknown>>;
                    entity = await this.findOne(params as unknown as FindOptionsWhere<T>, true);
                }
                
                const isNew = entity === null;
                let upsertEntity = entity ?? this.repository.create(item as unknown as DeepPartial<T>);

                if ('deletedAt' in upsertEntity && upsertEntity.deletedAt != null) {
                    throw new ConflictException('One or more entities have been deleted');
                }

                const context: HookContext<T> = {
                    operation: 'upsert' as Method,
                    params,
                    currentEntity: entity ?? undefined,
                };

                // Execute hooks
                const processedBody = item;
                _.assign(upsertEntity, processedBody);
                // No configuration-based hooks
                // No configuration-based hooks

                return { entity: upsertEntity, isNew };
            });

            const upsertData = await Promise.all(upsertPromises);
            const entitiesToSave = upsertData.map(d => d.entity);
            
            return this.repository
                .save(entitiesToSave, crudUpsertRequest.saveOptions)
                .then(async (savedEntities) => {
                    // Execute saveAfter hook for each entity
                    const processedEntities = await Promise.all(
                        savedEntities.map(async (entity, index) => {
                            const context: HookContext<T> = {
                                operation: 'upsert' as Method,
                                params: {},
                            };
                            const afterSaveEntity = entity;
                            return this.excludeEntity(afterSaveEntity, crudUpsertRequest.exclude);
                        })
                    );

                    // Transform entities to plain objects
                    const transformedEntities = this.transformEntityToPlain(processedEntities) as T[];
                    const excludedFields = crudUpsertRequest.exclude.size > 0 ? [...crudUpsertRequest.exclude] : undefined;

                    return createCrudArrayResponse<T>(transformedEntities, { 
                        excludedFields,
                        // Track which entities were new vs updated
                        upsertInfo: upsertData.map(d => ({ isNew: d.isNew }))
                    });
                })
                .catch(this.throwConflictException);
        } else {
            // Single upsert (existing logic)
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
                const processedBody = crudUpsertRequest.body;

                // 엔티티에 데이터 할당
                _.assign(upsertEntity, processedBody);

                // assignAfter 훅 실행
                // No configuration-based hooks

                // saveBefore 훅 실행
                // No configuration-based hooks

                return this.repository
                    .save(upsertEntity, crudUpsertRequest.saveOptions)
                    .then(async (savedEntity) => {
                        // saveAfter 훅 실행
                        // No configuration-based hooks

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
        }
    };

    readonly handleUpdate = async (
        crudUpdateRequest: CrudUpdateOneRequest<T> | CrudUpdateManyRequest<T>,
    ): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const isMany = isCrudUpdateManyRequest<T>(crudUpdateRequest);
        
        if (isMany) {
            // Bulk update handling - Optimized to avoid N+1 queries
            const primaryKeyName = this.primaryKey[0];
            
            // 1. Collect all IDs
            const ids = crudUpdateRequest.body.map(item => item.id || item[primaryKeyName]);
            
            // 2. Fetch all entities with a single query using In operator
            const entities = await this.repository.find({
                where: { [primaryKeyName]: In(ids) } as FindOptionsWhere<T>
            });
            
            // 3. Create a map for fast lookup
            const entityMap = new Map<any, T>();
            entities.forEach(entity => {
                entityMap.set(entity[primaryKeyName], entity);
            });
            
            // 4. Check for missing entities
            const missingIds = ids.filter(id => !entityMap.has(id));
            if (missingIds.length > 0) {
                throw new NotFoundException(`Entities not found: ${missingIds.join(', ')}`);
            }
            
            // 5. Process updates with hooks
            const entitiesToUpdate = await Promise.all(
                crudUpdateRequest.body.map(async (item) => {
                    const { id, ...updateData } = item;
                    const entityId = id || item[primaryKeyName];
                    const entity = entityMap.get(entityId)!;
                    const params = { [primaryKeyName]: entityId } as Partial<Record<keyof T, unknown>>;
                    
                    const context: HookContext<T> = {
                        operation: 'update' as Method,
                        params,
                        currentEntity: entity,
                    };
                    
                    // Apply update data to entity
                    _.assign(entity, updateData);
                    
                    // Execute hooks
                    let processedEntity = entity;
                    // No configuration-based hooks
                    // No configuration-based hooks
                    
                    return processedEntity;
                })
            );
            
            return this.repository
                .save(entitiesToUpdate, crudUpdateRequest.saveOptions)
                .then(async (updatedEntities) => {
                    // Execute saveAfter hook for each entity
                    const processedEntities = await Promise.all(
                        updatedEntities.map(async (entity, index) => {
                            const context: HookContext<T> = {
                                operation: 'update' as Method,
                                params: { [this.primaryKey[0]]: crudUpdateRequest.body[index].id },
                            };
                            const afterSaveEntity = entity;
                            return this.excludeEntity(afterSaveEntity, crudUpdateRequest.exclude);
                        })
                    );

                    // Transform entities to plain objects
                    const transformedEntities = this.transformEntityToPlain(processedEntities) as T[];
                    const excludedFields = crudUpdateRequest.exclude.size > 0 ? [...crudUpdateRequest.exclude] : undefined;

                    return createCrudArrayResponse<T>(transformedEntities, { excludedFields });
                })
                .catch(this.throwConflictException);
        } else {
            // Single update (existing logic)
            return this.findOne(crudUpdateRequest.params as unknown as FindOptionsWhere<T>, false).then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                const context: HookContext<T> = {
                    operation: 'update' as Method,
                    params: crudUpdateRequest.params,
                    currentEntity: entity,
                };

                // 🚀 UPDATE 개선: body를 entity에 먼저 할당 후 beforeUpdate 훅에서 entity 처리
                // 1. body 데이터를 entity에 임시 할당
                _.assign(entity, crudUpdateRequest.body);

                // 2. assignBefore 훅 실행 (UPDATE의 경우 entity 기반)
                // No configuration-based hooks

                // assignAfter 훅 실행
                // No configuration-based hooks

                // saveBefore 훅 실행
                // No configuration-based hooks

                return this.repository
                    .save(entity, crudUpdateRequest.saveOptions)
                    .then(async (updatedEntity) => {
                        // saveAfter 훅 실행
                        // No configuration-based hooks

                        const processedEntity = this.excludeEntity(updatedEntity, crudUpdateRequest.exclude);

                        // Transform entity to plain object to apply @Exclude decorators
                        const transformedEntity = this.transformEntityToPlain(processedEntity);
                        const excludedFields = crudUpdateRequest.exclude.size > 0 ? [...crudUpdateRequest.exclude] : undefined;

                        return createCrudResponse(transformedEntity, { excludedFields });
                    })
                    .catch(this.throwConflictException);
            });
        }
    };

    readonly handleDestroy = async (
        crudDeleteRequest: CrudDeleteOneRequest<T> | CrudDeleteManyRequest<T>,
    ): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        if (this.primaryKey.length === 0) {
            throw new ConflictException('cannot found primary key from entity');
        }
        
        const isMany = isCrudDeleteManyRequest<T>(crudDeleteRequest);
        
        if (isMany) {
            // Bulk delete handling - Optimized to avoid N+1 queries
            const primaryKeyName = this.primaryKey[0];
            
            // 1. Extract IDs from params
            const ids = crudDeleteRequest.params.map(params => params[primaryKeyName]);
            
            // 2. Fetch all entities with a single query using In operator
            const entities = await this.repository.find({
                where: { [primaryKeyName]: In(ids) } as FindOptionsWhere<T>
            });
            
            // 3. Create a map for fast lookup
            const entityMap = new Map<any, T>();
            entities.forEach(entity => {
                entityMap.set(entity[primaryKeyName], entity);
            });
            
            // 4. Check for missing entities
            const missingIds = ids.filter(id => !entityMap.has(id));
            if (missingIds.length > 0) {
                throw new NotFoundException(`Entities not found: ${missingIds.join(', ')}`);
            }
            
            // 5. Process deletes with hooks
            const entitiesToDelete = await Promise.all(
                crudDeleteRequest.params.map(async (params) => {
                    const entityId = params[primaryKeyName];
                    const entity = entityMap.get(entityId)!;
                    
                    const context: HookContext<T> = {
                        operation: 'destroy' as Method,
                        params,
                        currentEntity: entity,
                    };
                    
                    // Execute destroyBefore hook
                    const processedEntity = entity;
                    
                    return processedEntity;
                })
            );
            
            // Perform bulk delete
            const deletedEntities = await (crudDeleteRequest.softDeleted
                ? this.repository.softRemove(entitiesToDelete, crudDeleteRequest.saveOptions)
                : this.repository.remove(entitiesToDelete, crudDeleteRequest.saveOptions));

            // Execute destroyAfter hook for each entity
            const processedEntities = await Promise.all(
                deletedEntities.map(async (entity, index) => {
                    const context: HookContext<T> = {
                        operation: 'destroy' as Method,
                        params: crudDeleteRequest.params[index],
                    };
                    const afterDestroyEntity = entity;
                    return this.excludeEntity(afterDestroyEntity, crudDeleteRequest.exclude);
                })
            );

            // Transform entities to plain objects
            const transformedEntities = this.transformEntityToPlain(processedEntities);
            const excludedFields = crudDeleteRequest.exclude.size > 0 ? [...crudDeleteRequest.exclude] : undefined;

            return createCrudArrayResponse(transformedEntities, {
                excludedFields,
                wasSoftDeleted: crudDeleteRequest.softDeleted,
            });
        } else {
            // Single delete (existing logic)
            return this.findOne(crudDeleteRequest.params as unknown as FindOptionsWhere<T>, false).then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                const context: HookContext<T> = {
                    operation: 'destroy' as Method,
                    params: crudDeleteRequest.params,
                    currentEntity: entity,
                };

                // 🚀 destroyBefore 훅 실행 - entity를 받아서 entity를 반환
                // No configuration-based hooks

                await (crudDeleteRequest.softDeleted
                    ? this.repository.softRemove(entity, crudDeleteRequest.saveOptions)
                    : this.repository.remove(entity, crudDeleteRequest.saveOptions));

                // 🚀 destroyAfter 훅 실행 - 삭제 후 처리
                // No configuration-based hooks

                const processedEntity = this.excludeEntity(entity, crudDeleteRequest.exclude);

                // Transform entity to plain object to apply @Exclude decorators
                const transformedEntity = this.transformEntityToPlain(processedEntity);
                const excludedFields = crudDeleteRequest.exclude.size > 0 ? [...crudDeleteRequest.exclude] : undefined;

                return createCrudResponse(transformedEntity, {
                    excludedFields,
                    wasSoftDeleted: crudDeleteRequest.softDeleted,
                });
            });
        }
    };

    readonly handleRecover = async (
        crudRecoverRequest: CrudRecoverRequest<T> | CrudRecoverManyRequest<T>,
    ): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const isMany = isCrudRecoverManyRequest<T>(crudRecoverRequest);
        
        if (isMany) {
            // Bulk recover handling - Optimized to avoid N+1 queries
            const primaryKeyName = this.primaryKey[0];
            
            // 1. Extract IDs from params
            const ids = crudRecoverRequest.params.map(params => params[primaryKeyName]);
            
            // 2. Fetch all entities with a single query using In operator (with deleted records)
            const entities = await this.repository.find({
                where: { [primaryKeyName]: In(ids) } as FindOptionsWhere<T>,
                withDeleted: true
            });
            
            // 3. Create a map for fast lookup
            const entityMap = new Map<any, T>();
            entities.forEach(entity => {
                entityMap.set(entity[primaryKeyName], entity);
            });
            
            // 4. Check for missing entities
            const missingIds = ids.filter(id => !entityMap.has(id));
            if (missingIds.length > 0) {
                throw new NotFoundException(`Entities not found: ${missingIds.join(', ')}`);
            }
            
            // 5. Process recovers with hooks
            const recoverData = await Promise.all(
                crudRecoverRequest.params.map(async (params) => {
                    const entityId = params[primaryKeyName];
                    const entity = entityMap.get(entityId)!;
                    
                    const context: HookContext<T> = {
                        operation: 'recover' as Method,
                        params,
                        currentEntity: entity,
                    };
                    
                    const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;
                    
                    // Execute recoverBefore hook
                    const processedEntity = entity;
                    
                    return { entity: processedEntity, wasSoftDeleted };
                })
            );
            
            const entitiesToRecover = recoverData.map(d => d.entity);
            
            // Perform bulk recover
            await this.repository.recover(entitiesToRecover, crudRecoverRequest.saveOptions).catch(this.throwConflictException);

            // Execute recoverAfter hook for each entity
            const processedEntities = await Promise.all(
                entitiesToRecover.map(async (entity, index) => {
                    const context: HookContext<T> = {
                        operation: 'recover' as Method,
                        params: crudRecoverRequest.params[index],
                    };
                    const afterRecoverEntity = entity;
                    return this.excludeEntity(afterRecoverEntity, crudRecoverRequest.exclude);
                })
            );

            // Transform entities to plain objects
            const transformedEntities = this.transformEntityToPlain(processedEntities);
            const excludedFields = crudRecoverRequest.exclude.size > 0 ? [...crudRecoverRequest.exclude] : undefined;

            return createCrudArrayResponse(transformedEntities, {
                excludedFields,
                wasSoftDeleted: recoverData.some(d => d.wasSoftDeleted),
            });
        } else {
            // Single recover (existing logic)
            return this.findOne(crudRecoverRequest.params as unknown as FindOptionsWhere<T>, true).then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                const context: HookContext<T> = {
                    operation: 'recover' as Method,
                    params: crudRecoverRequest.params,
                    currentEntity: entity,
                };

                const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;

                // 🚀 recoverBefore 훅 실행 - entity를 받아서 entity를 반환
                // No configuration-based hooks

                await this.repository.recover(entity, crudRecoverRequest.saveOptions).catch(this.throwConflictException);

                // 🚀 recoverAfter 훅 실행 - 복구 후 처리
                // No configuration-based hooks

                const processedEntity = this.excludeEntity(entity, crudRecoverRequest.exclude);

                // Transform entity to plain object to apply @Exclude decorators
                const transformedEntity = this.transformEntityToPlain(processedEntity);
                const excludedFields = crudRecoverRequest.exclude.size > 0 ? [...crudRecoverRequest.exclude] : undefined;

                return createCrudResponse(transformedEntity, {
                    excludedFields,
                    wasSoftDeleted,
                });
            });
        }
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
}

