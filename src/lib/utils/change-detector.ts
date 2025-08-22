/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectLiteral } from 'typeorm';
import { Injectable } from '@nestjs/common';

/**
 * 변경사항 감지 및 최적화 클래스
 */
@Injectable()
export class ChangeDetector {
    private static changeHistory = new Map<string, ChangeRecord[]>();
    private static fieldTrackingConfig = new Map<string, FieldTrackingConfig>();

    /**
     * 엔티티 변경사항 감지
     */
    static detectChanges<T extends ObjectLiteral>(
        originalEntity: T,
        updatedData: Partial<T>,
        options?: ChangeDetectionOptions
    ): ChangeDetectionResult<T> {
        const changes: FieldChange[] = [];
        const metadata: ChangeMetadata = {
            detectionTime: Date.now(),
            affectedFields: [],
            changeTypes: [],
            optimizationHints: [],
        };

        // 필드별 변경사항 분석
        for (const [key, newValue] of Object.entries(updatedData)) {
            const fieldName = key as keyof T;
            const originalValue = originalEntity[fieldName];

            const fieldChange = this.analyzeFieldChange(
                fieldName as string,
                originalValue,
                newValue,
                options
            );

            if (fieldChange) {
                changes.push(fieldChange);
                metadata.affectedFields.push(fieldName as string);
                
                if (!metadata.changeTypes.includes(fieldChange.changeType)) {
                    metadata.changeTypes.push(fieldChange.changeType);
                }
            }
        }

        // 최적화 힌트 생성
        metadata.optimizationHints = this.generateOptimizationHints(changes, originalEntity);

        // 변경 이력 저장
        if (options?.trackHistory) {
            this.recordChange(originalEntity, changes, metadata);
        }

        return {
            hasChanges: changes.length > 0,
            changes,
            metadata,
            optimizedUpdateData: this.createOptimizedUpdateData(changes) as Partial<T>,
            changeScore: this.calculateChangeScore(changes),
        };
    }

    /**
     * 스마트 업데이트 최적화
     */
    static optimizeUpdate<T extends ObjectLiteral>(
        originalEntity: T,
        updateData: Partial<T>,
        options?: UpdateOptimizationOptions
    ): OptimizedUpdateResult<T> {
        const detectionResult = this.detectChanges(originalEntity, updateData, {
            trackHistory: options?.trackHistory,
            deepComparison: options?.deepComparison,
        });

        if (!detectionResult.hasChanges) {
            return {
                shouldUpdate: false,
                optimizedData: {},
                changeMetadata: detectionResult.metadata,
                performanceGains: {
                    skippedFields: Object.keys(updateData).length,
                    estimatedTimeSaved: this.estimateTimeSaved(Object.keys(updateData).length),
                },
            };
        }

        // 변경된 필드만 추출
        const optimizedData = detectionResult.optimizedUpdateData;

        // 낙관적 락 적용
        if (options?.optimisticLocking && this.supportsOptimisticLocking(originalEntity)) {
            (optimizedData as any).version = ((originalEntity as any).version || 0) + 1;
        }

        // 캐스케이드 업데이트 처리
        if (options?.cascade) {
            this.applyCascadeUpdates(optimizedData, options.cascade, detectionResult.changes);
        }

        return {
            shouldUpdate: true,
            optimizedData,
            changeMetadata: detectionResult.metadata,
            performanceGains: {
                skippedFields: Object.keys(updateData).length - Object.keys(optimizedData).length,
                estimatedTimeSaved: this.estimateTimeSaved(
                    Object.keys(updateData).length - Object.keys(optimizedData).length
                ),
            },
        };
    }

    /**
     * 배치 업데이트 최적화
     */
    static optimizeBatchUpdate<T extends ObjectLiteral>(
        updates: Array<{ entity: T; updateData: Partial<T> }>,
        options?: BatchOptimizationOptions
    ): BatchOptimizationResult<T> {
        const optimizedUpdates: Array<{ entity: T; updateData: Partial<T> }> = [];
        const skippedUpdates: Array<{ entity: T; reason: string }> = [];
        const batchMetadata: BatchChangeMetadata = {
            totalItems: updates.length,
            itemsWithChanges: 0,
            skippedItems: 0,
            commonChanges: [],
            optimizationOpportunities: [],
        };

        // 개별 업데이트 최적화
        for (const update of updates) {
            const optimized = this.optimizeUpdate(update.entity, update.updateData, {
                deepComparison: options?.deepComparison,
                optimisticLocking: options?.optimisticLocking,
            });

            if (optimized.shouldUpdate) {
                optimizedUpdates.push({
                    entity: update.entity,
                    updateData: optimized.optimizedData,
                });
                batchMetadata.itemsWithChanges++;
            } else {
                skippedUpdates.push({
                    entity: update.entity,
                    reason: 'No changes detected',
                });
                batchMetadata.skippedItems++;
            }
        }

        // 공통 변경사항 패턴 분석
        batchMetadata.commonChanges = this.analyzeCommonChanges(optimizedUpdates);
        batchMetadata.optimizationOpportunities = this.identifyBatchOptimizations(optimizedUpdates);

        return {
            optimizedUpdates,
            skippedUpdates,
            metadata: batchMetadata,
            shouldExecute: optimizedUpdates.length > 0,
            performanceGains: {
                originalCount: updates.length,
                optimizedCount: optimizedUpdates.length,
                reductionPercentage: Math.round(
                    ((updates.length - optimizedUpdates.length) / updates.length) * 100
                ),
            },
        };
    }

    /**
     * 필드 추적 설정
     */
    static configureFieldTracking(
        entityName: string,
        config: FieldTrackingConfig
    ): void {
        this.fieldTrackingConfig.set(entityName, config);
    }

    /**
     * 변경 이력 조회
     */
    static getChangeHistory(
        entityKey: string,
        limit?: number
    ): ChangeRecord[] {
        const history = this.changeHistory.get(entityKey) || [];
        return limit ? history.slice(-limit) : history;
    }

    /**
     * 변경 패턴 분석
     */
    static analyzeChangePatterns(
        entityName: string,
        timeRange?: { start: number; end: number }
    ): ChangePatternAnalysis {
        const allRecords = Array.from(this.changeHistory.values()).flat();
        const filteredRecords = timeRange
            ? allRecords.filter(record => 
                record.timestamp >= timeRange.start && record.timestamp <= timeRange.end
              )
            : allRecords;

        return {
            totalChanges: filteredRecords.length,
            mostChangedFields: this.getMostChangedFields(filteredRecords),
            changeFrequency: this.calculateChangeFrequency(filteredRecords),
            patterns: this.identifyChangePatterns(filteredRecords),
        };
    }

    // Private helper methods

    private static analyzeFieldChange(
        fieldName: string,
        originalValue: any,
        newValue: any,
        options?: ChangeDetectionOptions
    ): FieldChange | null {
        // 값이 같으면 변경사항 없음
        if (this.isEqual(originalValue, newValue, options?.deepComparison)) {
            return null;
        }

        const changeType = this.determineChangeType(originalValue, newValue);
        const impact = this.assessChangeImpact(fieldName, originalValue, newValue);

        return {
            fieldName,
            originalValue,
            newValue,
            changeType,
            impact,
            timestamp: Date.now(),
        };
    }

    private static isEqual(value1: any, value2: any, deepComparison = false): boolean {
        if (value1 === value2) return true;

        if (!deepComparison) return false;

        // 깊은 비교
        if (value1 == null || value2 == null) return value1 === value2;
        
        if (typeof value1 !== typeof value2) return false;

        if (typeof value1 === 'object') {
            if (Array.isArray(value1) !== Array.isArray(value2)) return false;

            if (Array.isArray(value1)) {
                if (value1.length !== value2.length) return false;
                return value1.every((item, index) => this.isEqual(item, value2[index], true));
            }

            const keys1 = Object.keys(value1);
            const keys2 = Object.keys(value2);
            
            if (keys1.length !== keys2.length) return false;

            return keys1.every(key => this.isEqual(value1[key], value2[key], true));
        }

        return false;
    }

    private static determineChangeType(originalValue: any, newValue: any): ChangeType {
        if (originalValue == null && newValue != null) return 'create';
        if (originalValue != null && newValue == null) return 'delete';
        
        const originalType = typeof originalValue;
        const newType = typeof newValue;
        
        if (originalType !== newType) return 'type_change';
        
        if (Array.isArray(originalValue) || Array.isArray(newValue)) {
            return 'collection_change';
        }
        
        if (originalType === 'object') return 'object_change';
        
        return 'value_change';
    }

    private static assessChangeImpact(
        fieldName: string,
        originalValue: any,
        newValue: any
    ): ChangeImpact {
        // 필드별 중요도 설정 (실제 환경에서는 설정 가능하게)
        const criticalFields = ['id', 'status', 'email', 'role'];
        const importantFields = ['name', 'title', 'description'];

        if (criticalFields.includes(fieldName)) {
            return 'high';
        }

        if (importantFields.includes(fieldName)) {
            return 'medium';
        }

        // 값 크기 기반 영향도 평가
        const originalSize = this.getValueSize(originalValue);
        const newSize = this.getValueSize(newValue);
        
        if (Math.abs(originalSize - newSize) > 1000) {
            return 'high';
        }

        return 'low';
    }

    private static getValueSize(value: any): number {
        if (value == null) return 0;
        if (typeof value === 'string') return value.length;
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'object') return Object.keys(value).length;
        return 1;
    }

    private static generateOptimizationHints(
        changes: FieldChange[],
        originalEntity: any
    ): string[] {
        const hints: string[] = [];

        const highImpactChanges = changes.filter(c => c.impact === 'high').length;
        if (highImpactChanges > 0) {
            hints.push(`${highImpactChanges} high-impact changes detected - consider validation`);
        }

        const collectionChanges = changes.filter(c => c.changeType === 'collection_change').length;
        if (collectionChanges > 0) {
            hints.push(`${collectionChanges} collection changes - consider cascade operations`);
        }

        if (changes.length > 10) {
            hints.push('Many fields changed - consider full entity replacement');
        }

        return hints;
    }

    private static createOptimizedUpdateData(changes: FieldChange[]): Record<string, any> {
        const optimizedData: Record<string, any> = {};

        for (const change of changes) {
            optimizedData[change.fieldName] = change.newValue;
        }

        return optimizedData;
    }

    private static calculateChangeScore(changes: FieldChange[]): number {
        let score = 0;

        for (const change of changes) {
            switch (change.impact) {
                case 'high':
                    score += 5;
                    break;
                case 'medium':
                    score += 3;
                    break;
                case 'low':
                    score += 1;
                    break;
            }

            // 변경 타입별 가중치
            switch (change.changeType) {
                case 'create':
                case 'delete':
                    score += 2;
                    break;
                case 'type_change':
                    score += 3;
                    break;
                case 'collection_change':
                    score += 2;
                    break;
            }
        }

        return score;
    }

    private static recordChange(
        entity: any,
        changes: FieldChange[],
        metadata: ChangeMetadata
    ): void {
        const entityKey = this.getEntityKey(entity);
        const changeRecord: ChangeRecord = {
            entityKey,
            changes,
            metadata,
            timestamp: Date.now(),
        };

        if (!this.changeHistory.has(entityKey)) {
            this.changeHistory.set(entityKey, []);
        }

        const history = this.changeHistory.get(entityKey)!;
        history.push(changeRecord);

        // 히스토리 크기 제한 (최근 100개만 유지)
        if (history.length > 100) {
            history.shift();
        }
    }

    private static getEntityKey(entity: any): string {
        const entityName = entity.constructor.name;
        const id = entity.id || entity._id || 'unknown';
        return `${entityName}:${id}`;
    }

    private static estimateTimeSaved(skippedFields: number): number {
        // 필드당 평균 처리 시간 (밀리초)
        const avgProcessingTimePerField = 2;
        return skippedFields * avgProcessingTimePerField;
    }

    private static supportsOptimisticLocking(entity: any): boolean {
        return 'version' in entity;
    }

    private static applyCascadeUpdates(
        updateData: any,
        cascadeRules: string[],
        changes: FieldChange[]
    ): void {
        for (const rule of cascadeRules) {
            const affectedChanges = changes.filter(c => c.fieldName.includes(rule));
            if (affectedChanges.length > 0) {
                updateData[`${rule}_updated_at`] = new Date();
            }
        }
    }

    private static analyzeCommonChanges(
        updates: Array<{ entity: any; updateData: Partial<any> }>
    ): CommonChange[] {
        const fieldCounts = new Map<string, number>();
        const fieldValues = new Map<string, Map<any, number>>();

        for (const update of updates) {
            for (const [field, value] of Object.entries(update.updateData)) {
                fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);

                if (!fieldValues.has(field)) {
                    fieldValues.set(field, new Map());
                }
                const valueMap = fieldValues.get(field)!;
                valueMap.set(value, (valueMap.get(value) || 0) + 1);
            }
        }

        const commonChanges: CommonChange[] = [];
        const threshold = Math.max(1, Math.floor(updates.length * 0.1)); // 10% 이상

        for (const [field, count] of fieldCounts.entries()) {
            if (count >= threshold) {
                const valueMap = fieldValues.get(field)!;
                const mostCommonValue = Array.from(valueMap.entries())
                    .sort((a, b) => b[1] - a[1])[0];

                commonChanges.push({
                    fieldName: field,
                    frequency: count,
                    percentage: Math.round((count / updates.length) * 100),
                    mostCommonValue: mostCommonValue[0],
                });
            }
        }

        return commonChanges.sort((a, b) => b.frequency - a.frequency);
    }

    private static identifyBatchOptimizations(
        updates: Array<{ entity: any; updateData: Partial<any> }>
    ): string[] {
        const optimizations: string[] = [];

        if (updates.length > 100) {
            optimizations.push('Consider using bulk update for better performance');
        }

        const commonChanges = this.analyzeCommonChanges(updates);
        const highFrequencyChanges = commonChanges.filter(c => c.percentage > 50);

        if (highFrequencyChanges.length > 0) {
            optimizations.push(`${highFrequencyChanges.length} fields changed in >50% of updates - consider bulk operations`);
        }

        return optimizations;
    }

    private static getMostChangedFields(records: ChangeRecord[]): Array<{ field: string; count: number }> {
        const fieldCounts = new Map<string, number>();

        for (const record of records) {
            for (const change of record.changes) {
                fieldCounts.set(change.fieldName, (fieldCounts.get(change.fieldName) || 0) + 1);
            }
        }

        return Array.from(fieldCounts.entries())
            .map(([field, count]) => ({ field, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

    private static calculateChangeFrequency(records: ChangeRecord[]): number {
        if (records.length < 2) return 0;

        const timeSpan = records[records.length - 1].timestamp - records[0].timestamp;
        return records.length / (timeSpan / (24 * 60 * 60 * 1000)); // changes per day
    }

    private static identifyChangePatterns(records: ChangeRecord[]): ChangePattern[] {
        // 변경 패턴 분석 로직 (시간대별, 필드별 패턴 등)
        return [];
    }
}

// 타입 정의들
export type ChangeType = 'create' | 'delete' | 'value_change' | 'type_change' | 'object_change' | 'collection_change';
export type ChangeImpact = 'low' | 'medium' | 'high';

export interface FieldChange {
    fieldName: string;
    originalValue: any;
    newValue: any;
    changeType: ChangeType;
    impact: ChangeImpact;
    timestamp: number;
}

export interface ChangeMetadata {
    detectionTime: number;
    affectedFields: string[];
    changeTypes: ChangeType[];
    optimizationHints: string[];
}

export interface ChangeDetectionResult<T> {
    hasChanges: boolean;
    changes: FieldChange[];
    metadata: ChangeMetadata;
    optimizedUpdateData: Partial<T>;
    changeScore: number;
}

export interface ChangeDetectionOptions {
    trackHistory?: boolean;
    deepComparison?: boolean;
    excludeFields?: string[];
    includeFieldsOnly?: string[];
}

export interface UpdateOptimizationOptions extends ChangeDetectionOptions {
    optimisticLocking?: boolean;
    cascade?: string[];
}

export interface OptimizedUpdateResult<T> {
    shouldUpdate: boolean;
    optimizedData: Partial<T>;
    changeMetadata: ChangeMetadata;
    performanceGains: {
        skippedFields: number;
        estimatedTimeSaved: number;
    };
}

export interface BatchOptimizationOptions {
    deepComparison?: boolean;
    optimisticLocking?: boolean;
}

export interface BatchOptimizationResult<T> {
    optimizedUpdates: Array<{ entity: T; updateData: Partial<T> }>;
    skippedUpdates: Array<{ entity: T; reason: string }>;
    metadata: BatchChangeMetadata;
    shouldExecute: boolean;
    performanceGains: {
        originalCount: number;
        optimizedCount: number;
        reductionPercentage: number;
    };
}

export interface BatchChangeMetadata {
    totalItems: number;
    itemsWithChanges: number;
    skippedItems: number;
    commonChanges: CommonChange[];
    optimizationOpportunities: string[];
}

export interface CommonChange {
    fieldName: string;
    frequency: number;
    percentage: number;
    mostCommonValue: any;
}

export interface FieldTrackingConfig {
    trackChanges: boolean;
    criticalFields: string[];
    importantFields: string[];
    excludeFields: string[];
}

export interface ChangeRecord {
    entityKey: string;
    changes: FieldChange[];
    metadata: ChangeMetadata;
    timestamp: number;
}

export interface ChangePatternAnalysis {
    totalChanges: number;
    mostChangedFields: Array<{ field: string; count: number }>;
    changeFrequency: number;
    patterns: ChangePattern[];
}

export interface ChangePattern {
    type: 'temporal' | 'field_correlation' | 'batch_operation';
    description: string;
    frequency: number;
    confidence: number;
}