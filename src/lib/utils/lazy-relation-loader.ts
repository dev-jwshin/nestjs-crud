/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Request } from 'express';

/**
 * 지연 로딩 관계 처리 클래스
 */
@Injectable()
export class LazyRelationLoader<T extends ObjectLiteral = any> {
    private static relationCache = new Map<string, CachedRelation>();
    private static loadingQueue = new Map<string, LoadingPromise>();

    constructor(
        private repository: Repository<T>,
        private relationConfigs: Map<string, RelationConfig> = new Map()
    ) {}

    /**
     * 필요시에만 관계 로딩
     */
    async loadRelationsOnDemand(
        entities: T | T[],
        requestedRelations: string[],
        options?: LazyLoadOptions
    ): Promise<T | T[]> {
        const entityArray = Array.isArray(entities) ? entities : [entities];
        
        if (entityArray.length === 0) {
            return entities;
        }

        // 중복 제거 및 유효성 검증
        const validRelations = this.validateAndFilterRelations(requestedRelations, options);
        
        if (validRelations.length === 0) {
            return entities;
        }

        // 관계별로 그룹화하여 배치 로딩
        const loadedEntities = await this.batchLoadRelations(entityArray, validRelations, options);

        return Array.isArray(entities) ? loadedEntities : loadedEntities[0];
    }

    /**
     * 동적 관계 포함 (쿼리 파라미터 기반)
     */
    async loadDynamicIncludes(
        queryBuilder: SelectQueryBuilder<T>,
        includeParam: string,
        options?: DynamicIncludeOptions
    ): Promise<SelectQueryBuilder<T>> {
        const requestedIncludes = this.parseIncludeParam(includeParam);
        
        for (const include of requestedIncludes) {
            await this.applyDynamicInclude(queryBuilder, include, options);
        }

        return queryBuilder;
    }

    /**
     * 조건부 관계 로딩
     */
    async loadConditionalRelations(
        entities: T[],
        conditions: RelationCondition[],
        context: LoadingContext
    ): Promise<T[]> {
        const results = [...entities];

        for (const condition of conditions) {
            const applicableEntities = results.filter(entity => 
                condition.predicate(entity, context)
            );

            if (applicableEntities.length > 0) {
                await this.loadRelationForEntities(
                    applicableEntities,
                    condition.relationName,
                    condition.loadOptions
                );
            }
        }

        return results;
    }

    /**
     * 지연 로딩 성능 최적화
     */
    async optimizeRelationLoading(
        entities: T[],
        relations: string[],
        optimizationStrategy: OptimizationStrategy = 'auto'
    ): Promise<T[]> {
        switch (optimizationStrategy) {
            case 'batch':
                return await this.batchOptimizedLoading(entities, relations);
            case 'dataloader':
                return await this.dataloaderOptimizedLoading(entities, relations);
            case 'cache':
                return await this.cacheOptimizedLoading(entities, relations);
            case 'auto':
                return await this.autoOptimizedLoading(entities, relations);
            default:
                return entities;
        }
    }

    /**
     * 계층적 관계 로딩 (깊이 제한)
     */
    async loadHierarchicalRelations(
        entities: T[],
        relationPath: string,
        maxDepth: number = 3,
        options?: HierarchicalLoadOptions
    ): Promise<T[]> {
        return await this.loadRelationHierarchy(entities, relationPath, 0, maxDepth, options);
    }

    /**
     * 관계 로딩 메트릭스 수집
     */
    getLoadingMetrics(): RelationLoadingMetrics {
        const cacheEntries = Array.from(LazyRelationLoader.relationCache.values());
        const queueEntries = Array.from(LazyRelationLoader.loadingQueue.values());

        return {
            cacheSize: cacheEntries.length,
            cacheHitRate: this.calculateCacheHitRate(cacheEntries),
            activeLoadings: queueEntries.length,
            averageLoadTime: this.calculateAverageLoadTime(cacheEntries),
            memoryUsage: this.calculateMemoryUsage(cacheEntries),
        };
    }

    /**
     * 관계 설정 등록
     */
    registerRelationConfig(relationName: string, config: RelationConfig): void {
        this.relationConfigs.set(relationName, config);
    }

    /**
     * 캐시 관리
     */
    clearRelationCache(pattern?: string): number {
        if (!pattern) {
            const size = LazyRelationLoader.relationCache.size;
            LazyRelationLoader.relationCache.clear();
            return size;
        }

        let cleared = 0;
        const regex = new RegExp(pattern);
        
        for (const [key] of LazyRelationLoader.relationCache.entries()) {
            if (regex.test(key)) {
                LazyRelationLoader.relationCache.delete(key);
                cleared++;
            }
        }

        return cleared;
    }

    // Private helper methods

    private validateAndFilterRelations(
        requestedRelations: string[],
        options?: LazyLoadOptions
    ): string[] {
        return requestedRelations.filter(relation => {
            // 허용된 관계인지 확인
            if (options?.allowedRelations && !options.allowedRelations.includes(relation)) {
                return false;
            }

            // 금지된 관계인지 확인
            if (options?.forbiddenRelations?.includes(relation)) {
                return false;
            }

            // 관계 설정 존재 여부 확인
            const config = this.relationConfigs.get(relation);
            if (config && config.requiresAuth && !options?.hasAuth) {
                return false;
            }

            return true;
        });
    }

    private async batchLoadRelations(
        entities: T[],
        relations: string[],
        options?: LazyLoadOptions
    ): Promise<T[]> {
        const entityIds = entities.map(entity => this.getEntityId(entity));
        const results = [...entities];

        for (const relation of relations) {
            const cacheKey = this.generateCacheKey(entityIds, relation);
            
            // 캐시 확인
            if (options?.useCache) {
                const cached = LazyRelationLoader.relationCache.get(cacheKey);
                if (cached && !this.isCacheExpired(cached)) {
                    this.applyCachedRelations(results, cached.data, relation);
                    continue;
                }
            }

            // 중복 로딩 방지
            if (LazyRelationLoader.loadingQueue.has(cacheKey)) {
                await LazyRelationLoader.loadingQueue.get(cacheKey)!.promise;
                continue;
            }

            // 관계 로딩 실행
            await this.executeRelationLoading(results, relation, cacheKey, options);
        }

        return results;
    }

    private async executeRelationLoading(
        entities: T[],
        relation: string,
        cacheKey: string,
        options?: LazyLoadOptions
    ): Promise<void> {
        const loadingPromise = this.createLoadingPromise(entities, relation, options);
        LazyRelationLoader.loadingQueue.set(cacheKey, { promise: loadingPromise, startTime: Date.now() });

        try {
            const relationData = await loadingPromise;
            
            // 결과 적용
            this.applyRelationData(entities, relationData, relation);

            // 캐시 저장
            if (options?.useCache) {
                LazyRelationLoader.relationCache.set(cacheKey, {
                    data: relationData,
                    timestamp: Date.now(),
                    ttl: options.cacheTtl || 300000, // 5분 기본값
                });
            }

        } finally {
            LazyRelationLoader.loadingQueue.delete(cacheKey);
        }
    }

    private async createLoadingPromise(
        entities: T[],
        relation: string,
        options?: LazyLoadOptions
    ): Promise<any[]> {
        const entityIds = entities.map(entity => this.getEntityId(entity));
        const config = this.relationConfigs.get(relation);

        if (config?.customLoader) {
            return await config.customLoader(entityIds, options);
        }

        // 기본 TypeORM 관계 로딩
        return await this.loadRelationWithTypeORM(entityIds, relation, options);
    }

    private async loadRelationWithTypeORM(
        entityIds: any[],
        relation: string,
        options?: LazyLoadOptions
    ): Promise<any[]> {
        const relationMetadata = this.repository.metadata.findRelationWithPropertyPath(relation);
        if (!relationMetadata) {
            throw new Error(`Relation '${relation}' not found`);
        }

        const qb = this.repository
            .createQueryBuilder('entity')
            .leftJoinAndSelect(`entity.${relation}`, relation)
            .where('entity.id IN (:...ids)', { ids: entityIds });

        // 추가 조건 적용
        if (options?.where) {
            qb.andWhere(options.where);
        }

        // 정렬 적용
        if (options?.orderBy) {
            Object.entries(options.orderBy).forEach(([field, direction]) => {
                qb.addOrderBy(field, direction);
            });
        }

        return await qb.getMany();
    }

    private applyRelationData(entities: T[], relationData: any[], relationName: string): void {
        const dataByEntityId = new Map();
        
        for (const data of relationData) {
            const entityId = this.getEntityId(data);
            if (!dataByEntityId.has(entityId)) {
                dataByEntityId.set(entityId, []);
            }
            dataByEntityId.get(entityId).push(data[relationName]);
        }

        for (const entity of entities) {
            const entityId = this.getEntityId(entity);
            const relatedData = dataByEntityId.get(entityId);
            
            if (relatedData) {
                (entity as any)[relationName] = relatedData.length === 1 ? relatedData[0] : relatedData;
            }
        }
    }

    private applyCachedRelations(entities: T[], cachedData: any[], relationName: string): void {
        // 캐시된 데이터를 엔티티에 적용
        this.applyRelationData(entities, cachedData, relationName);
    }

    private parseIncludeParam(includeParam: string): ParsedInclude[] {
        return includeParam
            .split(',')
            .map(include => include.trim())
            .filter(Boolean)
            .map(include => {
                const parts = include.split('.');
                return {
                    relationPath: parts,
                    depth: parts.length,
                    fullPath: include,
                };
            });
    }

    private async applyDynamicInclude(
        queryBuilder: SelectQueryBuilder<T>,
        include: ParsedInclude,
        options?: DynamicIncludeOptions
    ): Promise<void> {
        // 깊이 제한 확인
        if (options?.maxDepth && include.depth > options.maxDepth) {
            return;
        }

        // 관계 경로 구성
        let currentAlias = queryBuilder.alias;
        for (let i = 0; i < include.relationPath.length; i++) {
            const relationName = include.relationPath[i];
            const nextAlias = `${currentAlias}_${relationName}`;

            queryBuilder.leftJoinAndSelect(
                `${currentAlias}.${relationName}`,
                nextAlias
            );

            currentAlias = nextAlias;
        }
    }

    private async loadRelationForEntities(
        entities: T[],
        relationName: string,
        loadOptions?: RelationLoadOptions
    ): Promise<void> {
        const entityIds = entities.map(entity => this.getEntityId(entity));
        const relationData = await this.loadRelationWithTypeORM(entityIds, relationName, loadOptions);
        this.applyRelationData(entities, relationData, relationName);
    }

    private async loadRelationHierarchy(
        entities: T[],
        relationPath: string,
        currentDepth: number,
        maxDepth: number,
        options?: HierarchicalLoadOptions
    ): Promise<T[]> {
        if (currentDepth >= maxDepth) {
            return entities;
        }

        const parts = relationPath.split('.');
        const currentRelation = parts[0];
        const remainingPath = parts.slice(1).join('.');

        // 현재 레벨 관계 로딩
        await this.loadRelationForEntities(entities, currentRelation);

        // 하위 레벨이 있으면 재귀적으로 로딩
        if (remainingPath && currentDepth < maxDepth - 1) {
            for (const entity of entities) {
                const relatedEntities = (entity as any)[currentRelation];
                if (relatedEntities) {
                    const relatedArray = Array.isArray(relatedEntities) ? relatedEntities : [relatedEntities];
                    await this.loadRelationHierarchy(relatedArray, remainingPath, currentDepth + 1, maxDepth, options);
                }
            }
        }

        return entities;
    }

    private async batchOptimizedLoading(entities: T[], relations: string[]): Promise<T[]> {
        // 배치 최적화 로직
        return entities;
    }

    private async dataloaderOptimizedLoading(entities: T[], relations: string[]): Promise<T[]> {
        // DataLoader 스타일 최적화
        return entities;
    }

    private async cacheOptimizedLoading(entities: T[], relations: string[]): Promise<T[]> {
        // 캐시 최적화 로직
        return entities;
    }

    private async autoOptimizedLoading(entities: T[], relations: string[]): Promise<T[]> {
        // 자동 최적화 전략 선택
        if (entities.length > 100) {
            return await this.batchOptimizedLoading(entities, relations);
        } else if (relations.length > 5) {
            return await this.cacheOptimizedLoading(entities, relations);
        } else {
            return await this.dataloaderOptimizedLoading(entities, relations);
        }
    }

    private getEntityId(entity: any): any {
        return entity.id || entity._id;
    }

    private generateCacheKey(entityIds: any[], relation: string): string {
        const idsStr = entityIds.sort().join(',');
        return `${this.repository.metadata.tableName}:${relation}:${idsStr}`;
    }

    private isCacheExpired(cached: CachedRelation): boolean {
        return Date.now() - cached.timestamp > cached.ttl;
    }

    private calculateCacheHitRate(cacheEntries: CachedRelation[]): number {
        if (cacheEntries.length === 0) return 0;
        // 실제 구현에서는 히트/미스 카운터 필요
        return 0.8; // 임시값
    }

    private calculateAverageLoadTime(cacheEntries: CachedRelation[]): number {
        // 실제 구현에서는 로딩 시간 추적 필요
        return 100; // 임시값 (ms)
    }

    private calculateMemoryUsage(cacheEntries: CachedRelation[]): number {
        // 대략적인 메모리 사용량 계산
        return cacheEntries.reduce((total, entry) => {
            return total + JSON.stringify(entry.data).length;
        }, 0);
    }
}

// 타입 정의들
export interface LazyLoadOptions {
    useCache?: boolean;
    cacheTtl?: number;
    allowedRelations?: string[];
    forbiddenRelations?: string[];
    hasAuth?: boolean;
    where?: string;
    orderBy?: Record<string, 'ASC' | 'DESC'>;
}

export interface DynamicIncludeOptions {
    maxDepth?: number;
    allowedRelations?: string[];
}

export interface RelationCondition {
    relationName: string;
    predicate: (entity: any, context: LoadingContext) => boolean;
    loadOptions?: RelationLoadOptions;
}

export interface LoadingContext {
    user?: any;
    request?: Request;
    timestamp: number;
}

export interface RelationLoadOptions {
    where?: string;
    orderBy?: Record<string, 'ASC' | 'DESC'>;
    limit?: number;
}

export interface HierarchicalLoadOptions {
    loadParallel?: boolean;
    cacheIntermediateResults?: boolean;
}

export interface RelationConfig {
    customLoader?: (entityIds: any[], options?: any) => Promise<any[]>;
    requiresAuth?: boolean;
    defaultOptions?: RelationLoadOptions;
    cacheable?: boolean;
}

export interface CachedRelation {
    data: any[];
    timestamp: number;
    ttl: number;
}

export interface LoadingPromise {
    promise: Promise<any[]>;
    startTime: number;
}

export interface ParsedInclude {
    relationPath: string[];
    depth: number;
    fullPath: string;
}

export interface RelationLoadingMetrics {
    cacheSize: number;
    cacheHitRate: number;
    activeLoadings: number;
    averageLoadTime: number;
    memoryUsage: number;
}

export type OptimizationStrategy = 'batch' | 'dataloader' | 'cache' | 'auto';