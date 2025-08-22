/* eslint-disable @typescript-eslint/no-explicit-any */
import { Repository, SelectQueryBuilder, ObjectLiteral, EntityMetadata } from 'typeorm';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * 자동 관계 감지 및 최적화 클래스
 */
export class AutoRelationDetector {
    private static relationCache = new Map<string, RelationInfo[]>();
    private static nPlusOneCache = new Map<string, Set<string>>();

    /**
     * 엔티티의 관계 정보 추출
     */
    static getEntityRelations(entity: any): RelationInfo[] {
        const entityName = entity.name || entity.constructor?.name;
        
        if (this.relationCache.has(entityName)) {
            return this.relationCache.get(entityName)!;
        }

        const metadataStorage = getMetadataArgsStorage();
        const relations: RelationInfo[] = [];

        // TypeORM 메타데이터에서 관계 정보 추출
        const relationMetadatas = metadataStorage.relations.filter(
            rel => rel.target === entity || rel.target === entity.constructor
        );

        for (const relationMeta of relationMetadatas) {
            const relationInfo: RelationInfo = {
                propertyName: relationMeta.propertyName,
                relationType: relationMeta.relationType,
                inverseSide: relationMeta.inverseSideProperty,
                isLazy: relationMeta.isLazy || false,
                cascadeOptions: this.extractCascadeOptions(relationMeta),
                joinColumns: this.extractJoinColumns(relationMeta),
                isOwner: this.isOwnerSide(relationMeta),
                targetEntity: relationMeta.type as any,
            };

            relations.push(relationInfo);
        }

        this.relationCache.set(entityName, relations);
        return relations;
    }

    /**
     * N+1 문제 자동 감지
     */
    static detectNPlusOneQueries(
        queryBuilder: SelectQueryBuilder<any>,
        relations: string[]
    ): NPlusOneAnalysis {
        const analysis: NPlusOneAnalysis = {
            hasNPlusOneRisk: false,
            riskyRelations: [],
            recommendations: [],
            optimizedIncludes: [],
        };

        const entityName = queryBuilder.alias;
        const entityRelations = this.getEntityRelations(queryBuilder.expressionMap.mainAlias?.metadata.target);

        for (const relation of relations) {
            const relationInfo = entityRelations.find(r => r.propertyName === relation);
            
            if (!relationInfo) continue;

            // OneToMany나 ManyToMany 관계는 N+1 위험이 높음
            if (relationInfo.relationType === 'one-to-many' || relationInfo.relationType === 'many-to-many') {
                analysis.hasNPlusOneRisk = true;
                analysis.riskyRelations.push({
                    relationName: relation,
                    relationType: relationInfo.relationType,
                    reason: `${relationInfo.relationType} relation can cause N+1 queries`,
                });

                // 최적화 추천사항 생성
                analysis.recommendations.push({
                    type: 'join',
                    relation: relation,
                    suggestion: `Use leftJoinAndSelect for ${relation} to avoid N+1 queries`,
                    performance_impact: 'high',
                });
            }
        }

        // 최적화된 include 경로 생성
        analysis.optimizedIncludes = this.generateOptimizedIncludes(entityRelations, relations);

        return analysis;
    }

    /**
     * 쿼리 빌더에 자동 최적화 적용
     */
    static applyAutoOptimization<T extends ObjectLiteral>(
        queryBuilder: SelectQueryBuilder<T>,
        relations: string[],
        options: AutoOptimizationOptions = {}
    ): SelectQueryBuilder<T> {
        const entityRelations = this.getEntityRelations(queryBuilder.expressionMap.mainAlias?.metadata.target);
        const analysis = this.detectNPlusOneQueries(queryBuilder, relations);

        // N+1 최적화 적용
        if (analysis.hasNPlusOneRisk && options.preventNPlusOne !== false) {
            for (const optimizedInclude of analysis.optimizedIncludes) {
                this.applyOptimizedJoin(queryBuilder, optimizedInclude);
            }
        }

        // 지연 로딩 관계 처리
        if (options.handleLazyRelations !== false) {
            this.handleLazyRelations(queryBuilder, entityRelations, relations);
        }

        // 순환 참조 방지
        if (options.preventCircularReferences !== false) {
            this.preventCircularReferences(queryBuilder, entityRelations, relations);
        }

        return queryBuilder;
    }

    /**
     * 스마트 관계 로딩 전략 결정
     */
    static determineLoadingStrategy(
        entityMetadata: EntityMetadata,
        requestedRelations: string[]
    ): LoadingStrategy {
        const strategy: LoadingStrategy = {
            eager: [],
            lazy: [],
            selective: [],
            recommendations: [],
        };

        const entityRelations = this.getEntityRelations(entityMetadata.target);

        for (const relationName of requestedRelations) {
            const relationInfo = entityRelations.find(r => r.propertyName === relationName);
            
            if (!relationInfo) continue;

            // 관계 타입과 크기에 따른 전략 결정
            if (relationInfo.relationType === 'many-to-one' || relationInfo.relationType === 'one-to-one') {
                strategy.eager.push(relationName);
            } else if (relationInfo.relationType === 'one-to-many' || relationInfo.relationType === 'many-to-many') {
                // 큰 컬렉션은 지연 로딩 권장
                strategy.lazy.push(relationName);
                strategy.recommendations.push({
                    relation: relationName,
                    strategy: 'lazy',
                    reason: 'Large collection detected, lazy loading recommended',
                });
            }
        }

        return strategy;
    }

    /**
     * 관계 최적화 메트릭스 생성
     */
    static generateOptimizationMetrics(
        queryBuilder: SelectQueryBuilder<any>,
        relations: string[]
    ): OptimizationMetrics {
        const analysis = this.detectNPlusOneQueries(queryBuilder, relations);
        
        return {
            totalRelations: relations.length,
            riskyRelations: analysis.riskyRelations.length,
            optimizationScore: this.calculateOptimizationScore(analysis),
            estimatedQueries: this.estimateQueryCount(relations, analysis),
            recommendations: analysis.recommendations,
        };
    }

    // Private helper methods

    private static extractJoinColumns(relationMeta: any): string[] {
        // TypeORM 메타데이터에서 조인 컬럼 정보 추출
        return relationMeta.joinColumns?.map((jc: any) => jc.name) || [];
    }

    private static extractCascadeOptions(relationMeta: any): string[] {
        const cascade = relationMeta.options?.cascade;
        if (!cascade) return [];
        if (cascade === true) return ['insert', 'update', 'remove', 'soft-remove', 'recover'];
        if (Array.isArray(cascade)) return cascade;
        return [];
    }

    private static isOwnerSide(relationMeta: any): boolean {
        // 관계의 소유자 측인지 확인
        return !relationMeta.inverseSideProperty;
    }

    private static generateOptimizedIncludes(
        entityRelations: RelationInfo[],
        requestedRelations: string[]
    ): OptimizedInclude[] {
        const optimized: OptimizedInclude[] = [];

        for (const relation of requestedRelations) {
            const relationInfo = entityRelations.find(r => r.propertyName === relation);
            
            if (!relationInfo) continue;

            optimized.push({
                relation,
                joinType: this.getOptimalJoinType(relationInfo),
                alias: `${relation}_opt`,
                condition: relationInfo.joinColumns.length > 0 ? 'custom' : 'default',
            });
        }

        return optimized;
    }

    private static getOptimalJoinType(relationInfo: RelationInfo): 'inner' | 'left' | 'right' {
        // 관계 타입에 따른 최적 조인 타입 결정
        if (relationInfo.relationType === 'many-to-one' && relationInfo.isOwner) {
            return 'inner'; // 필수 관계
        }
        return 'left'; // 선택적 관계
    }

    private static applyOptimizedJoin<T>(
        queryBuilder: SelectQueryBuilder<T>,
        optimizedInclude: OptimizedInclude
    ): void {
        const { relation, joinType, alias } = optimizedInclude;

        if (joinType === 'inner') {
            queryBuilder.innerJoinAndSelect(`${queryBuilder.alias}.${relation}`, alias);
        } else {
            queryBuilder.leftJoinAndSelect(`${queryBuilder.alias}.${relation}`, alias);
        }
    }

    private static handleLazyRelations<T>(
        queryBuilder: SelectQueryBuilder<T>,
        entityRelations: RelationInfo[],
        requestedRelations: string[]
    ): void {
        // 지연 로딩 관계에 대한 특별 처리
        const lazyRelations = entityRelations.filter(r => 
            r.isLazy && requestedRelations.includes(r.propertyName)
        );

        for (const lazyRelation of lazyRelations) {
            // 지연 로딩 관계를 eager 로딩으로 변경
            queryBuilder.leftJoinAndSelect(
                `${queryBuilder.alias}.${lazyRelation.propertyName}`,
                `${lazyRelation.propertyName}_eager`
            );
        }
    }

    private static preventCircularReferences<T>(
        queryBuilder: SelectQueryBuilder<T>,
        entityRelations: RelationInfo[],
        requestedRelations: string[]
    ): void {
        // 순환 참조 감지 및 방지 로직
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCircularReference = (relation: string, depth: number = 0): boolean => {
            if (depth > 3) return true; // 최대 깊이 제한
            if (recursionStack.has(relation)) return true;
            if (visited.has(relation)) return false;

            visited.add(relation);
            recursionStack.add(relation);

            const relationInfo = entityRelations.find(r => r.propertyName === relation);
            if (relationInfo?.inverseSide) {
                if (hasCircularReference(relationInfo.inverseSide, depth + 1)) {
                    return true;
                }
            }

            recursionStack.delete(relation);
            return false;
        };

        // 순환 참조가 있는 관계 제거
        const safeRelations = requestedRelations.filter(relation => 
            !hasCircularReference(relation)
        );

        // 안전한 관계만 포함
        // queryBuilder 수정 로직은 여기에 추가
    }

    private static calculateOptimizationScore(analysis: NPlusOneAnalysis): number {
        const totalRelations = analysis.optimizedIncludes.length;
        const riskyRelations = analysis.riskyRelations.length;
        
        if (totalRelations === 0) return 100;
        
        const riskRatio = riskyRelations / totalRelations;
        return Math.max(0, 100 - (riskRatio * 100));
    }

    private static estimateQueryCount(relations: string[], analysis: NPlusOneAnalysis): number {
        // 기본 쿼리 1개 + 최적화되지 않은 관계당 추가 쿼리
        let baseQueries = 1;
        let additionalQueries = 0;

        for (const riskyRelation of analysis.riskyRelations) {
            // N+1 위험이 있는 관계는 추가 쿼리 발생 예상
            additionalQueries += 10; // 평균적으로 10개의 추가 쿼리 예상
        }

        return baseQueries + additionalQueries;
    }
}

// 타입 정의들
export interface RelationInfo {
    propertyName: string;
    relationType: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    inverseSide?: string;
    isLazy: boolean;
    cascadeOptions: string[];
    joinColumns: string[];
    isOwner: boolean;
    targetEntity: any;
}

export interface NPlusOneAnalysis {
    hasNPlusOneRisk: boolean;
    riskyRelations: Array<{
        relationName: string;
        relationType: string;
        reason: string;
    }>;
    recommendations: Array<{
        type: 'join' | 'batch' | 'cache';
        relation: string;
        suggestion: string;
        performance_impact: 'low' | 'medium' | 'high';
    }>;
    optimizedIncludes: OptimizedInclude[];
}

export interface OptimizedInclude {
    relation: string;
    joinType: 'inner' | 'left' | 'right';
    alias: string;
    condition: 'default' | 'custom';
}

export interface AutoOptimizationOptions {
    preventNPlusOne?: boolean;
    handleLazyRelations?: boolean;
    preventCircularReferences?: boolean;
    maxDepth?: number;
}

export interface LoadingStrategy {
    eager: string[];
    lazy: string[];
    selective: string[];
    recommendations: Array<{
        relation: string;
        strategy: 'eager' | 'lazy' | 'selective';
        reason: string;
    }>;
}

export interface OptimizationMetrics {
    totalRelations: number;
    riskyRelations: number;
    optimizationScore: number;
    estimatedQueries: number;
    recommendations: Array<{
        type: string;
        relation: string;
        suggestion: string;
        performance_impact: string;
    }>;
}