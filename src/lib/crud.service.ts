import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import _ from 'lodash';

import { isCrudCreateManyRequest, createCrudResponse, createCrudArrayResponse } from './interface';

import type {
    CrudReadOneRequest,
    CrudDeleteOneRequest,
    CrudUpdateOneRequest,
    CrudUpsertRequest,
    CrudRecoverRequest,
    PaginationResponse,
    CrudCreateOneRequest,
    CrudCreateManyRequest,
    EntityType,
    CrudResponse,
    CrudArrayResponse,
    LifecycleHooks,
    HookContext,
    Method,
} from './interface';
import type { CrudReadManyRequest } from './request';
import type { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';

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

        return createCrudArrayResponse(data, 'index', {
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
                return createCrudResponse(entity, 'show', {
                    includedRelations: crudReadOneRequest.relations,
                    excludedFields: crudReadOneRequest.excludedColumns ? Array.from(crudReadOneRequest.excludedColumns) : undefined,
                });
            });
    };

    readonly reservedCreate = async (crudCreateRequest: CrudCreateOneRequest<T> | CrudCreateManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
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
            })
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

        // Author 정보 설정
        if (crudCreateRequest.author) {
            for (const entity of entities) {
                _.merge(entity, { [crudCreateRequest.author.property]: crudCreateRequest.author.value });
            }
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

                const excludedFields = crudCreateRequest.exclude.size > 0 ? Array.from(crudCreateRequest.exclude) : undefined;

                return isMany
                    ? createCrudArrayResponse(processedResult as T[], 'create', { excludedFields })
                    : createCrudResponse(processedResult as T, 'create', { excludedFields });
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
                currentEntity: entity || undefined,
            };

            // assignBefore 훅 실행
            const processedBody = await this.executeAssignBeforeHook(crudUpsertRequest.hooks, crudUpsertRequest.body, context);

            // 엔티티에 데이터 할당
            _.assign(upsertEntity, processedBody);

            // assignAfter 훅 실행
            upsertEntity = await this.executeAssignAfterHook(crudUpsertRequest.hooks, upsertEntity, processedBody, context);

            // Author 정보 설정
            if (crudUpsertRequest.author) {
                _.merge(upsertEntity, { [crudUpsertRequest.author.property]: crudUpsertRequest.author.value });
            }

            // saveBefore 훅 실행
            upsertEntity = await this.executeSaveBeforeHook(crudUpsertRequest.hooks, upsertEntity, context);

            return this.repository
                .save(upsertEntity, crudUpsertRequest.saveOptions)
                .then(async (savedEntity) => {
                    // saveAfter 훅 실행
                    savedEntity = await this.executeSaveAfterHook(crudUpsertRequest.hooks, savedEntity, context);

                    const processedEntity = this.excludeEntity(savedEntity, crudUpsertRequest.exclude);
                    const excludedFields = crudUpsertRequest.exclude.size > 0 ? Array.from(crudUpsertRequest.exclude) : undefined;

                    return createCrudResponse(processedEntity, 'upsert', {
                        isNew,
                        excludedFields
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

            // assignBefore 훅 실행
            const processedBody = await this.executeAssignBeforeHook(crudUpdateOneRequest.hooks, crudUpdateOneRequest.body, context);

            // 엔티티에 데이터 할당
            _.assign(entity, processedBody);

            // assignAfter 훅 실행
            entity = await this.executeAssignAfterHook(crudUpdateOneRequest.hooks, entity, processedBody, context);

            // Author 정보 설정
            if (crudUpdateOneRequest.author) {
                _.merge(entity, { [crudUpdateOneRequest.author.property]: crudUpdateOneRequest.author.value });
            }

            // saveBefore 훅 실행
            entity = await this.executeSaveBeforeHook(crudUpdateOneRequest.hooks, entity, context);

            return this.repository
                .save(entity, crudUpdateOneRequest.saveOptions)
                .then(async (updatedEntity) => {
                    // saveAfter 훅 실행
                    updatedEntity = await this.executeSaveAfterHook(crudUpdateOneRequest.hooks, updatedEntity, context);

                    const processedEntity = this.excludeEntity(updatedEntity, crudUpdateOneRequest.exclude);
                    const excludedFields = crudUpdateOneRequest.exclude.size > 0 ? Array.from(crudUpdateOneRequest.exclude) : undefined;

                    return createCrudResponse(processedEntity, 'update', { excludedFields });
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

            if (crudDeleteOneRequest.author) {
                _.merge(entity, { [crudDeleteOneRequest.author.property]: crudDeleteOneRequest.author.value });

                await this.repository.save(entity, crudDeleteOneRequest.saveOptions);
            }

            await (crudDeleteOneRequest.softDeleted
                ? this.repository.softRemove(entity, crudDeleteOneRequest.saveOptions)
                : this.repository.remove(entity, crudDeleteOneRequest.saveOptions));

            const processedEntity = this.excludeEntity(entity, crudDeleteOneRequest.exclude);
            const excludedFields = crudDeleteOneRequest.exclude.size > 0 ? Array.from(crudDeleteOneRequest.exclude) : undefined;

            return createCrudResponse(processedEntity, 'destroy', {
                excludedFields,
                wasSoftDeleted: crudDeleteOneRequest.softDeleted
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
            const excludedFields = crudRecoverRequest.exclude.size > 0 ? Array.from(crudRecoverRequest.exclude) : undefined;

            return createCrudResponse(processedEntity, 'recover', {
                excludedFields,
                wasSoftDeleted
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
        context: HookContext<TEntity>
    ): Promise<DeepPartial<TEntity>> {
        if (!hooks?.assignBefore) {
            return body;
        }
        return await hooks.assignBefore(body, context);
    }

    private async executeAssignAfterHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        body: DeepPartial<TEntity>,
        context: HookContext<TEntity>
    ): Promise<TEntity> {
        if (!hooks?.assignAfter) {
            return entity;
        }
        return await hooks.assignAfter(entity, body, context);
    }

    private async executeSaveBeforeHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        context: HookContext<TEntity>
    ): Promise<TEntity> {
        if (!hooks?.saveBefore) {
            return entity;
        }
        return await hooks.saveBefore(entity, context);
    }

    private async executeSaveAfterHook<TEntity>(
        hooks: LifecycleHooks<TEntity> | undefined,
        entity: TEntity,
        context: HookContext<TEntity>
    ): Promise<TEntity> {
        if (!hooks?.saveAfter) {
            return entity;
        }
        return await hooks.saveAfter(entity, context);
    }
}
