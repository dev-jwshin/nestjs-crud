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
    isCrudRecoverManyRequest,
    FilterOperator
} from './interface';
import { ResponseFactory } from './utils/response-factory';
import { BatchProcessor } from './utils/batch-processor';

import type { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';
import type { RelationMetadata } from 'typeorm/metadata/RelationMetadata';
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
    private controllerInstance?: any;
    private cachedOneToManyRelations?: RelationMetadata[];

    constructor(public readonly repository: Repository<T>) {
        this.usableQueryRunner = SUPPORTED_REPLICATION_TYPES.has(this.repository.metadata.connection?.options.type);
        this.primaryKey = this.repository.metadata.primaryColumns?.map((columnMetadata) => columnMetadata.propertyName) ?? [];
        this.columnNames = this.repository.metadata.columns.map((column) => column.propertyPath);
    }

    setControllerInstance(controller: any): void {
        this.controllerInstance = controller;
    }

    /**
     * Entity의 OneToMany 관계 메타데이터 추출 (cascade insert가 활성화된 것만)
     * 성능을 위해 결과를 캐싱합니다.
     */
    private getOneToManyRelations(): RelationMetadata[] {
        if (!this.cachedOneToManyRelations) {
            this.cachedOneToManyRelations = this.repository.metadata.relations.filter(
                (relation) => relation.relationType === 'one-to-many' && relation.isCascadeInsert,
            );
        }
        return this.cachedOneToManyRelations;
    }

    /**
     * 관계의 역참조 필드명 찾기
     * @example Profile.profileHighlights → ProfileHighlight.profile
     */
    private getInversePropertyName(relation: RelationMetadata): string | null {
        return relation.inverseRelation?.propertyName ?? null;
    }

    /**
     * OneToMany 관계 필드명 배열 반환 (orphanedRowAction을 위한 관계 로드용)
     */
    private getOneToManyRelationNames(): string[] {
        const relations = this.getOneToManyRelations();
        return relations.map((relation) => relation.propertyName);
    }

    /**
     * CREATE 작업 후 entity의 OneToMany 관계에 부모 ID를 설정합니다.
     * repository.create() 후 호출되어야 합니다.
     *
     * 순환 참조를 방지하기 위해 부모 엔티티 자체가 아닌 ID만 설정합니다.
     */
    private setParentReferencesAfterCreate(parentEntity: any): void {
        const oneToManyRelations = this.getOneToManyRelations();

        for (const relation of oneToManyRelations) {
            const propertyName = relation.propertyName;
            const inverseRelation = relation.inverseRelation;

            if (!inverseRelation) {
                continue;
            }

            const nestedEntities = parentEntity[propertyName];

            if (Array.isArray(nestedEntities)) {
                for (const nestedEntity of nestedEntities) {
                    if (nestedEntity && typeof nestedEntity === 'object') {
                        // 부모 ID 필드명 찾기 (예: profileId)
                        const foreignKeyColumns = inverseRelation.foreignKeys[0]?.columnNames;
                        if (foreignKeyColumns && foreignKeyColumns.length > 0) {
                            const foreignKeyName = foreignKeyColumns[0]; // 예: 'profileId'

                            // 부모의 PK 값 가져오기
                            const parentPkValue = parentEntity[this.primaryKey[0]];

                            // nested entity에 FK 설정
                            if (parentPkValue !== undefined) {
                                nestedEntity[foreignKeyName] = parentPkValue;
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * UPDATE 작업 시 body에 포함된 OneToMany 관계를 기존 entity에서 제거합니다.
     * orphanedRowAction: 'delete'가 설정되어 있으면 TypeORM이 자동으로 기존 항목을 삭제합니다.
     *
     * @example
     * entity.profileHighlights = [기존1, 기존2] (먼저 로드됨)
     * body = { profileHighlights: [새1] }
     * → entity.profileHighlights = [] (orphan으로 표시)
     * → _.assign 후 entity.profileHighlights = [새1]
     * → save 시 TypeORM이 orphan(기존1, 기존2)을 자동 삭제
     */
    private clearOneToManyRelations<T>(entity: T, body: DeepPartial<T>): void {
        const oneToManyRelations = this.getOneToManyRelations();

        for (const relation of oneToManyRelations) {
            const propertyName = relation.propertyName;

            // body에 해당 관계 필드가 있으면 entity에서 빈 배열로 초기화
            // orphanedRowAction이 있으면 TypeORM이 자동으로 기존 항목 삭제
            if ((body as any)[propertyName] !== undefined) {
                (entity as any)[propertyName] = [];
            }
        }
    }

    /**
     * UPDATE 작업 시 OneToMany 관계의 nested entities에 부모 ID를 설정합니다.
     * 순환 참조를 방지하기 위해 부모 엔티티 자체가 아닌 ID만 설정합니다.
     *
     * @example
     * // Before
     * body = { profileHighlights: [{ before: '헬스케어' }] }
     *
     * // After
     * body.profileHighlights[0].profileId = parentEntity.id
     */
    private setParentReferences<T>(body: DeepPartial<T>, parentEntity: T): DeepPartial<T> {
        const oneToManyRelations = this.getOneToManyRelations();

        for (const relation of oneToManyRelations) {
            const propertyName = relation.propertyName;
            const inverseRelation = relation.inverseRelation;

            if (!inverseRelation) {
                continue;
            }

            const nestedEntities = (body as any)[propertyName];

            // 배열 처리
            if (Array.isArray(nestedEntities)) {
                for (const nestedEntity of nestedEntities) {
                    if (nestedEntity && typeof nestedEntity === 'object') {
                        // ID가 없는 새 엔티티만 부모 ID 설정 (기존 엔티티는 덮어쓰지 않음)
                        const hasId = this.primaryKey.some((pk) => nestedEntity[pk as keyof typeof nestedEntity] != null);
                        if (!hasId) {
                            // 부모 ID 필드명 찾기 (예: profileId)
                            const foreignKeyColumns = inverseRelation.foreignKeys[0]?.columnNames;
                            if (foreignKeyColumns && foreignKeyColumns.length > 0) {
                                const foreignKeyName = foreignKeyColumns[0];
                                const parentPkValue = (parentEntity as any)[this.primaryKey[0]];

                                if (parentPkValue !== undefined) {
                                    nestedEntity[foreignKeyName] = parentPkValue;
                                }
                            }
                        }
                    }
                }
            }
            // 단일 객체 처리
            else if (nestedEntities && typeof nestedEntities === 'object') {
                const hasId = this.primaryKey.some((pk) => (nestedEntities as any)[pk] != null);
                if (!hasId) {
                    const foreignKeyColumns = inverseRelation.foreignKeys[0]?.columnNames;
                    if (foreignKeyColumns && foreignKeyColumns.length > 0) {
                        const foreignKeyName = foreignKeyColumns[0];
                        const parentPkValue = (parentEntity as any)[this.primaryKey[0]];

                        if (parentPkValue !== undefined) {
                            (nestedEntities as any)[foreignKeyName] = parentPkValue;
                        }
                    }
                }
            }
        }

        return body;
    }

    /**
     * PostgreSQL 전문 검색 기능 사용 가능 여부를 확인합니다.
     */
    private validatePostgreSQLFullTextSearch(): void {
        const databaseType = this.repository.metadata.connection?.options.type;
        if (databaseType !== 'postgres') {
            throw new Error(
                'Full-text search (_fts) operator is only supported with PostgreSQL database. ' +
                `Current database type (${databaseType}) does not support to_tsvector and plainto_tsquery functions.`
            );
        }
    }

    /**
     * 요청에서 전문 검색 사용 여부를 확인하고 필요 시 PostgreSQL 검증을 수행합니다.
     */
    private validateFullTextSearchInRequest(crudReadManyRequest: CrudReadManyRequest<T>): void {
        const findOptions = crudReadManyRequest.findOptions;
        
        // where 조건에서 Raw 쿼리 검색 (FTS는 Raw 쿼리로 변환됨)
        if (this.hasFullTextSearchInWhere(findOptions.where)) {
            this.validatePostgreSQLFullTextSearch();
        }
    }

    /**
     * Where 조건에서 전문 검색 Raw 쿼리가 있는지 확인합니다.
     */
    private hasFullTextSearchInWhere(where: any): boolean {
        if (!where) return false;

        if (Array.isArray(where)) {
            return where.some(w => this.hasFullTextSearchInWhere(w));
        }

        if (typeof where === 'object') {
            for (const value of Object.values(where)) {
                // TypeORM Raw 객체 확인
                if (value && typeof value === 'object' && '_type' in value && value._type === 'raw') {
                    const sql = (value as any).sql || '';
                    // PostgreSQL 전문 검색 함수 확인
                    if (sql.includes('to_tsvector') && sql.includes('plainto_tsquery')) {
                        return true;
                    }
                }
                
                // 중첩 객체 재귀 검색
                if (value && typeof value === 'object') {
                    if (this.hasFullTextSearchInWhere(value)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    readonly handleIndex = async (crudReadManyRequest: CrudReadManyRequest<T>): Promise<CrudArrayResponse<T>> => {
        // PostgreSQL 전문 검색 사용 시 데이터베이스 타입 검증
        this.validateFullTextSearchInRequest(crudReadManyRequest);
        
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
            controller: this.controllerInstance,
            request: crudReadOneRequest.request,
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
                    controller: this.controllerInstance,
                    request: crudCreateRequest.request,
                };
                let processedBody = body;
                if (crudCreateRequest.hooks?.assignBefore) {
                    processedBody = await crudCreateRequest.hooks.assignBefore(body, context) as DeepPartial<T>;
                }
                return processedBody;
            }),
        );

        // 엔티티 생성 및 부모 참조 설정
        const entities = processedBodyArray.map((body, index) => {
            const entity = this.repository.create(body);
            // CREATE 후 nested entities에 부모 참조 설정
            this.setParentReferencesAfterCreate(entity);
            return entity;
        });

        // assignAfter 훅 실행
        for (let i = 0; i < entities.length; i++) {
            const context: HookContext<T> = {
                operation: 'create' as Method,
                params: {},
                controller: this.controllerInstance,
                request: crudCreateRequest.request,
            };
            if (crudCreateRequest.hooks?.assignAfter) {
                entities[i] = await crudCreateRequest.hooks.assignAfter(entities[i], processedBodyArray[i], context);
            }
        }

        // saveBefore 훅 실행
        for (let i = 0; i < entities.length; i++) {
            const context: HookContext<T> = {
                operation: 'create' as Method,
                params: {},
                controller: this.controllerInstance,
                request: crudCreateRequest.request,
            };
            if (crudCreateRequest.hooks?.saveBefore) {
                entities[i] = await crudCreateRequest.hooks.saveBefore(entities[i], context);
            }
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
                        controller: this.controllerInstance,
                        request: crudCreateRequest.request,
                    };
                    if (crudCreateRequest.hooks?.saveAfter) {
                        result[i] = await crudCreateRequest.hooks.saveAfter(result[i], context);
                    }
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
                    controller: this.controllerInstance,
                    request: crudUpsertRequest.request,
                };

                // Execute hooks
                let processedBody = item;
                if (crudUpsertRequest.hooks?.assignBefore) {
                    processedBody = await crudUpsertRequest.hooks.assignBefore(processedBody as DeepPartial<T>, context) as DeepPartial<T>;
                }
                _.assign(upsertEntity, processedBody);

                // OneToMany 관계의 nested entities에 부모 참조 자동 설정
                this.setParentReferences(processedBody, upsertEntity);

                if (crudUpsertRequest.hooks?.assignAfter) {
                    upsertEntity = await crudUpsertRequest.hooks.assignAfter(upsertEntity, processedBody, context);
                }

                if (crudUpsertRequest.hooks?.saveBefore) {
                    upsertEntity = await crudUpsertRequest.hooks.saveBefore(upsertEntity, context);
                }

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
                                controller: this.controllerInstance,
                                request: crudUpsertRequest.request,
                            };
                            let afterSaveEntity = entity;
                            if (crudUpsertRequest.hooks?.saveAfter) {
                                afterSaveEntity = await crudUpsertRequest.hooks.saveAfter(entity, context);
                            }
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
                    request: crudUpsertRequest.request,
                };

                // assignBefore 훅 실행
                let processedBody = crudUpsertRequest.body;
                if (crudUpsertRequest.hooks?.assignBefore) {
                    processedBody = await crudUpsertRequest.hooks.assignBefore(processedBody, context) as DeepPartial<T>;
                }

                // 엔티티에 데이터 할당
                _.assign(upsertEntity, processedBody);

                // OneToMany 관계의 nested entities에 부모 참조 자동 설정
                this.setParentReferences(processedBody, upsertEntity);

                // assignAfter 훅 실행
                if (crudUpsertRequest.hooks?.assignAfter) {
                    upsertEntity = await crudUpsertRequest.hooks.assignAfter(upsertEntity, processedBody, context);
                }

                // saveBefore 훅 실행
                if (crudUpsertRequest.hooks?.saveBefore) {
                    upsertEntity = await crudUpsertRequest.hooks.saveBefore(upsertEntity, context);
                }

                return this.repository
                    .save(upsertEntity, crudUpsertRequest.saveOptions)
                    .then(async (savedEntity) => {
                        // saveAfter 훅 실행
                        let finalEntity = savedEntity;
                        if (crudUpsertRequest.hooks?.saveAfter) {
                            finalEntity = await crudUpsertRequest.hooks.saveAfter(savedEntity, context);
                        }

                        const processedEntity = this.excludeEntity(finalEntity, crudUpsertRequest.exclude);

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
                        controller: this.controllerInstance,
                        request: crudUpdateRequest.request,
                    };

                    // OneToMany 관계의 nested entities에 부모 참조 자동 설정
                    this.setParentReferences(updateData as DeepPartial<T>, entity);

                    // OneToMany 관계의 기존 항목을 교체하기 위해 빈 배열로 초기화
                    this.clearOneToManyRelations(entity, updateData as DeepPartial<T>);

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
                                controller: this.controllerInstance,
                                request: crudUpdateRequest.request,
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
            // orphanedRowAction이 작동하려면 OneToMany 관계를 먼저 로드해야 함
            const relationsToLoad = this.getOneToManyRelationNames();

            return this.repository.findOne({
                where: crudUpdateRequest.params as unknown as FindOptionsWhere<T>,
                relations: relationsToLoad,
            }).then(async (entity: T | null) => {
                if (!entity) {
                    throw new NotFoundException();
                }

                const context: HookContext<T> = {
                    operation: 'update' as Method,
                    params: crudUpdateRequest.params,
                    currentEntity: entity,
                    controller: this.controllerInstance,
                    request: crudUpdateRequest.request,
                };

                // 🚀 UPDATE 개선: body를 entity에 먼저 할당 후 beforeUpdate 훅에서 entity 처리
                // OneToMany 관계의 nested entities에 부모 참조 자동 설정 (assign 전에 실행)
                this.setParentReferences(crudUpdateRequest.body, entity);

                // OneToMany 관계의 기존 항목을 교체하기 위해 빈 배열로 초기화
                this.clearOneToManyRelations(entity, crudUpdateRequest.body);

                // 1. body 데이터를 entity에 임시 할당
                _.assign(entity, crudUpdateRequest.body);

                // 2. assignBefore 훅 실행 (UPDATE의 경우 entity 기반)
                let processedEntity = entity;
                if (crudUpdateRequest.hooks?.assignBefore) {
                    processedEntity = await crudUpdateRequest.hooks.assignBefore(entity, context) as T;
                }

                // assignAfter 훅 실행
                if (crudUpdateRequest.hooks?.assignAfter) {
                    processedEntity = await crudUpdateRequest.hooks.assignAfter(processedEntity, crudUpdateRequest.body, context);
                }

                // saveBefore 훅 실행
                if (crudUpdateRequest.hooks?.saveBefore) {
                    processedEntity = await crudUpdateRequest.hooks.saveBefore(processedEntity, context);
                }

                return this.repository
                    .save(processedEntity, crudUpdateRequest.saveOptions)
                    .then(async (updatedEntity) => {
                        // saveAfter 훅 실행
                        let finalEntity = updatedEntity;
                        if (crudUpdateRequest.hooks?.saveAfter) {
                            finalEntity = await crudUpdateRequest.hooks.saveAfter(updatedEntity, context);
                        }

                        const processedEntity = this.excludeEntity(finalEntity, crudUpdateRequest.exclude);

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
                        controller: this.controllerInstance,
                        request: crudDeleteRequest.request,
                    };
                    
                    // Execute destroyBefore hook
                    let processedEntity = entity;
                    if (crudDeleteRequest.hooks?.destroyBefore) {
                        processedEntity = await crudDeleteRequest.hooks.destroyBefore(entity, context);
                    }

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
                        controller: this.controllerInstance,
                        request: crudDeleteRequest.request,
                    };
                    let afterDestroyEntity = entity;
                    if (crudDeleteRequest.hooks?.destroyAfter) {
                        afterDestroyEntity = await crudDeleteRequest.hooks.destroyAfter(entity, context);
                    }
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
                    controller: this.controllerInstance,
                    request: crudDeleteRequest.request,
                };

                // 🚀 destroyBefore 훅 실행 - entity를 받아서 entity를 반환
                let processedEntity = entity;
                if (crudDeleteRequest.hooks?.destroyBefore) {
                    processedEntity = await crudDeleteRequest.hooks.destroyBefore(entity, context);
                }

                const deletedEntity = await (crudDeleteRequest.softDeleted
                    ? this.repository.softRemove(processedEntity, crudDeleteRequest.saveOptions)
                    : this.repository.remove(processedEntity, crudDeleteRequest.saveOptions));

                // 🚀 destroyAfter 훅 실행 - 삭제 후 처리
                let finalEntity = deletedEntity;
                if (crudDeleteRequest.hooks?.destroyAfter) {
                    finalEntity = await crudDeleteRequest.hooks.destroyAfter(deletedEntity, context);
                }

                const excludedEntity = this.excludeEntity(finalEntity, crudDeleteRequest.exclude);

                // Transform entity to plain object to apply @Exclude decorators
                const transformedEntity = this.transformEntityToPlain(excludedEntity);
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
                        controller: this.controllerInstance,
                        request: crudRecoverRequest.request,
                    };
                    
                    const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;
                    
                    // Execute recoverBefore hook
                    let processedEntity = entity;
                    if (crudRecoverRequest.hooks?.recoverBefore) {
                        processedEntity = await crudRecoverRequest.hooks.recoverBefore(entity, context);
                    }

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
                        controller: this.controllerInstance,
                        request: crudRecoverRequest.request,
                    };
                    let afterRecoverEntity = entity;
                    if (crudRecoverRequest.hooks?.recoverAfter) {
                        afterRecoverEntity = await crudRecoverRequest.hooks.recoverAfter(entity, context);
                    }
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
                    controller: this.controllerInstance,
                    request: crudRecoverRequest.request,
                };

                const wasSoftDeleted = 'deletedAt' in entity && entity.deletedAt != null;

                // 🚀 recoverBefore 훅 실행 - entity를 받아서 entity를 반환
                let processedEntity = entity;
                if (crudRecoverRequest.hooks?.recoverBefore) {
                    processedEntity = await crudRecoverRequest.hooks.recoverBefore(entity, context);
                }

                const recoveredEntity = await this.repository.recover(processedEntity, crudRecoverRequest.saveOptions).catch(this.throwConflictException);

                // 🚀 recoverAfter 훅 실행 - 복구 후 처리
                let finalEntity = recoveredEntity;
                if (crudRecoverRequest.hooks?.recoverAfter) {
                    finalEntity = await crudRecoverRequest.hooks.recoverAfter(recoveredEntity, context);
                }

                const excludedEntity = this.excludeEntity(finalEntity, crudRecoverRequest.exclude);

                // Transform entity to plain object to apply @Exclude decorators
                const transformedEntity = this.transformEntityToPlain(excludedEntity);
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

