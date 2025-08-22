/* eslint-disable @typescript-eslint/no-explicit-any */
import { Repository, ObjectLiteral, EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';

/**
 * 스마트 배치 처리 클래스
 */
@Injectable()
export class SmartBatchProcessor<T extends ObjectLiteral = any> {
    private static performanceProfiles = new Map<string, PerformanceProfile>();
    private static batchMetrics = new Map<string, BatchMetrics>();

    constructor(
        private repository: Repository<T>,
        private entityManager?: EntityManager
    ) {}

    /**
     * 자동 배치 크기 최적화를 통한 생성
     */
    async createBatch(
        items: Partial<T>[],
        options?: SmartBatchOptions
    ): Promise<BatchResult<T>> {
        const batchSize = this.calculateOptimalBatchSize('create', items.length, options);
        const startTime = Date.now();
        
        const result: BatchResult<T> = {
            totalItems: items.length,
            successCount: 0,
            failureCount: 0,
            batchSize,
            processingTime: 0,
            results: [],
            errors: [],
            metrics: this.initializeBatchMetrics(),
        };

        try {
            if (options?.parallel && items.length > batchSize) {
                result.results = await this.parallelBatchCreate(items, batchSize, options);
            } else {
                result.results = await this.sequentialBatchCreate(items, batchSize, options);
            }

            result.successCount = result.results.length;
        } catch (error) {
            result.errors.push({
                batchIndex: 0,
                error: error as Error,
                affectedItems: items,
            });
            result.failureCount = items.length;
        }

        result.processingTime = Date.now() - startTime;
        this.updatePerformanceProfile('create', result);

        return result;
    }

    /**
     * 스마트 배치 업데이트
     */
    async updateBatch(
        updates: Array<{ id: any; data: Partial<T> }>,
        options?: SmartBatchOptions
    ): Promise<BatchResult<T>> {
        const batchSize = this.calculateOptimalBatchSize('update', updates.length, options);
        const startTime = Date.now();

        const result: BatchResult<T> = {
            totalItems: updates.length,
            successCount: 0,
            failureCount: 0,
            batchSize,
            processingTime: 0,
            results: [],
            errors: [],
            metrics: this.initializeBatchMetrics(),
        };

        try {
            if (options?.detectChanges) {
                const filteredUpdates = await this.filterUnchangedItems(updates);
                result.metrics.optimizations.unchangedItemsSkipped = updates.length - filteredUpdates.length;
                
                if (filteredUpdates.length === 0) {
                    result.processingTime = Date.now() - startTime;
                    return result;
                }

                result.results = await this.processBatchUpdates(filteredUpdates, batchSize, options);
            } else {
                result.results = await this.processBatchUpdates(updates, batchSize, options);
            }

            result.successCount = result.results.length;
        } catch (error) {
            result.errors.push({
                batchIndex: 0,
                error: error as Error,
                affectedItems: updates,
            });
            result.failureCount = updates.length;
        }

        result.processingTime = Date.now() - startTime;
        this.updatePerformanceProfile('update', result);

        return result;
    }

    /**
     * 스마트 배치 삭제
     */
    async deleteBatch(
        ids: any[],
        options?: SmartBatchOptions
    ): Promise<BatchResult<any>> {
        const batchSize = this.calculateOptimalBatchSize('delete', ids.length, options);
        const startTime = Date.now();

        const result: BatchResult<any> = {
            totalItems: ids.length,
            successCount: 0,
            failureCount: 0,
            batchSize,
            processingTime: 0,
            results: [],
            errors: [],
            metrics: this.initializeBatchMetrics(),
        };

        try {
            if (options?.softDelete) {
                result.results = await this.processSoftDelete(ids, batchSize, options);
            } else {
                result.results = await this.processHardDelete(ids, batchSize, options);
            }

            result.successCount = result.results.length;
        } catch (error) {
            result.errors.push({
                batchIndex: 0,
                error: error as Error,
                affectedItems: ids,
            });
            result.failureCount = ids.length;
        }

        result.processingTime = Date.now() - startTime;
        this.updatePerformanceProfile('delete', result);

        return result;
    }

    /**
     * 진행 상황 추적이 가능한 배치 작업
     */
    async createBatchWithProgress(
        items: Partial<T>[],
        progressCallback: (progress: BatchProgress) => void,
        options?: SmartBatchOptions
    ): Promise<BatchResult<T>> {
        const batchSize = this.calculateOptimalBatchSize('create', items.length, options);
        const totalBatches = Math.ceil(items.length / batchSize);
        
        const result: BatchResult<T> = {
            totalItems: items.length,
            successCount: 0,
            failureCount: 0,
            batchSize,
            processingTime: 0,
            results: [],
            errors: [],
            metrics: this.initializeBatchMetrics(),
        };

        const startTime = Date.now();

        for (let i = 0; i < totalBatches; i++) {
            const batchStart = i * batchSize;
            const batchEnd = Math.min(batchStart + batchSize, items.length);
            const batchItems = items.slice(batchStart, batchEnd);

            try {
                const batchResults = await this.repository.save(batchItems as any);
                result.results.push(...batchResults);
                result.successCount += batchResults.length;

                // 진행 상황 콜백 호출
                const progress: BatchProgress = {
                    currentBatch: i + 1,
                    totalBatches,
                    processedItems: result.successCount,
                    totalItems: items.length,
                    percentage: Math.round((result.successCount / items.length) * 100),
                    estimatedTimeRemaining: this.estimateRemainingTime(
                        startTime,
                        result.successCount,
                        items.length
                    ),
                };

                progressCallback(progress);

            } catch (error) {
                result.errors.push({
                    batchIndex: i,
                    error: error as Error,
                    affectedItems: batchItems,
                });
                result.failureCount += batchItems.length;
            }
        }

        result.processingTime = Date.now() - startTime;
        return result;
    }

    /**
     * 트랜잭션 기반 배치 처리
     */
    async transactionalBatch<R>(
        operation: (manager: EntityManager) => Promise<R>,
        options?: SmartBatchOptions
    ): Promise<R> {
        const manager = this.entityManager || this.repository.manager;

        return await manager.transaction(async (transactionalManager) => {
            return await operation(transactionalManager);
        });
    }

    /**
     * 배치 성능 분석 보고서 생성
     */
    generatePerformanceReport(): BatchPerformanceReport {
        const profiles = Array.from(SmartBatchProcessor.performanceProfiles.entries());
        const metrics = Array.from(SmartBatchProcessor.batchMetrics.entries());

        return {
            profiles: profiles.map(([, profile]) => profile),
            recommendations: this.generateOptimizationRecommendations(profiles),
            totalOperations: metrics.reduce((sum, [, metric]) => sum + metric.totalBatches, 0),
            averageProcessingTime: this.calculateAverageProcessingTime(metrics),
        };
    }

    // Private helper methods

    private calculateOptimalBatchSize(
        operation: 'create' | 'update' | 'delete',
        itemCount: number,
        options?: SmartBatchOptions
    ): number {
        if (options?.batchSize && options.batchSize !== 'auto') {
            return options.batchSize as number;
        }

        const profile = SmartBatchProcessor.performanceProfiles.get(operation);
        
        if (profile) {
            // 성능 프로필을 기반으로 최적 배치 크기 계산
            return this.calculateAdaptiveBatchSize(profile, itemCount);
        }

        // 기본값 반환
        const defaultBatchSizes = {
            create: 100,
            update: 50,
            delete: 200,
        };

        return Math.min(defaultBatchSizes[operation], itemCount);
    }

    private calculateAdaptiveBatchSize(profile: PerformanceProfile, itemCount: number): number {
        // 성능 프로필 기반 적응형 배치 크기 계산
        const optimalSize = Math.round(profile.optimalBatchSize || 100);
        const memoryFactor = profile.memoryUsage > 80 ? 0.7 : 1.0;
        const cpuFactor = profile.cpuUsage > 80 ? 0.8 : 1.0;

        const adjustedSize = Math.round(optimalSize * memoryFactor * cpuFactor);
        return Math.min(adjustedSize, itemCount);
    }

    private async parallelBatchCreate(
        items: Partial<T>[],
        batchSize: number,
        options?: SmartBatchOptions
    ): Promise<T[]> {
        const batches = this.chunkArray(items, batchSize);
        const maxConcurrency = options?.maxConcurrency || 3;

        const results: T[] = [];
        
        for (let i = 0; i < batches.length; i += maxConcurrency) {
            const concurrentBatches = batches.slice(i, i + maxConcurrency);
            
            const batchPromises = concurrentBatches.map(async (batch) => {
                return await this.repository.save(batch as any);
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
        }

        return results;
    }

    private async sequentialBatchCreate(
        items: Partial<T>[],
        batchSize: number,
        options?: SmartBatchOptions
    ): Promise<T[]> {
        const batches = this.chunkArray(items, batchSize);
        const results: T[] = [];

        for (const batch of batches) {
            if (options?.validate) {
                await this.validateBatch(batch);
            }

            const batchResults = await this.repository.save(batch as any);
            results.push(...batchResults);
        }

        return results;
    }

    private async processBatchUpdates(
        updates: Array<{ id: any; data: Partial<T> }>,
        batchSize: number,
        options?: SmartBatchOptions
    ): Promise<T[]> {
        const batches = this.chunkArray(updates, batchSize);
        const results: T[] = [];

        for (const batch of batches) {
            for (const update of batch) {
                const result = await this.repository.save({
                    id: update.id,
                    ...update.data,
                } as any);
                results.push(result);
            }
        }

        return results;
    }

    private async processSoftDelete(
        ids: any[],
        batchSize: number,
        options?: SmartBatchOptions
    ): Promise<any[]> {
        const batches = this.chunkArray(ids, batchSize);
        const results: any[] = [];

        for (const batch of batches) {
            const result = await this.repository.softDelete(batch);
            results.push(result);
        }

        return results;
    }

    private async processHardDelete(
        ids: any[],
        batchSize: number,
        options?: SmartBatchOptions
    ): Promise<any[]> {
        const batches = this.chunkArray(ids, batchSize);
        const results: any[] = [];

        for (const batch of batches) {
            const result = await this.repository.delete(batch);
            results.push(result);
        }

        return results;
    }

    private async filterUnchangedItems(
        updates: Array<{ id: any; data: Partial<T> }>
    ): Promise<Array<{ id: any; data: Partial<T> }>> {
        const filteredUpdates: Array<{ id: any; data: Partial<T> }> = [];

        for (const update of updates) {
            const existingEntity = await this.repository.findOne({
                where: { id: update.id } as any,
            });

            if (existingEntity && this.hasChanges(existingEntity, update.data)) {
                filteredUpdates.push(update);
            }
        }

        return filteredUpdates;
    }

    private hasChanges(existing: T, updates: Partial<T>): boolean {
        for (const [key, value] of Object.entries(updates)) {
            if (existing[key as keyof T] !== value) {
                return true;
            }
        }
        return false;
    }

    private async validateBatch(batch: Partial<T>[]): Promise<void> {
        // 배치 유효성 검증 로직
        for (const item of batch) {
            if (!item || Object.keys(item).length === 0) {
                throw new Error('Invalid item in batch');
            }
        }
    }

    private chunkArray<U>(array: U[], chunkSize: number): U[][] {
        const chunks: U[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    private estimateRemainingTime(
        startTime: number,
        processedItems: number,
        totalItems: number
    ): number {
        if (processedItems === 0) return 0;
        
        const elapsedTime = Date.now() - startTime;
        const averageTimePerItem = elapsedTime / processedItems;
        const remainingItems = totalItems - processedItems;
        
        return Math.round(remainingItems * averageTimePerItem);
    }

    private updatePerformanceProfile(operation: string, result: BatchResult<T>): void {
        const existing = SmartBatchProcessor.performanceProfiles.get(operation);
        
        const profile: PerformanceProfile = {
            operation,
            totalExecutions: (existing?.totalExecutions || 0) + 1,
            averageProcessingTime: this.calculateRunningAverage(
                existing?.averageProcessingTime || 0,
                result.processingTime,
                (existing?.totalExecutions || 0) + 1
            ),
            optimalBatchSize: this.calculateOptimalBatchSizeFromResults(existing, result),
            memoryUsage: 0, // 실제 환경에서는 메모리 사용량 측정
            cpuUsage: 0,    // 실제 환경에서는 CPU 사용량 측정
            lastUpdate: Date.now(),
        };

        SmartBatchProcessor.performanceProfiles.set(operation, profile);
    }

    private calculateRunningAverage(
        currentAverage: number,
        newValue: number,
        count: number
    ): number {
        return (currentAverage * (count - 1) + newValue) / count;
    }

    private calculateOptimalBatchSizeFromResults(
        existing: PerformanceProfile | undefined,
        result: BatchResult<T>
    ): number {
        // 성능 결과를 기반으로 최적 배치 크기 조정
        const currentBatchSize = result.batchSize;
        const successRate = result.successCount / result.totalItems;
        const timePerItem = result.processingTime / result.totalItems;

        if (successRate > 0.95 && timePerItem < 10) {
            // 성공률이 높고 빠르면 배치 크기 증가
            return Math.min(currentBatchSize * 1.2, 500);
        } else if (successRate < 0.8 || timePerItem > 50) {
            // 성공률이 낮거나 느리면 배치 크기 감소
            return Math.max(currentBatchSize * 0.8, 10);
        }

        return currentBatchSize;
    }

    private initializeBatchMetrics(): BatchMetrics {
        return {
            totalBatches: 0,
            averageBatchSize: 0,
            totalProcessingTime: 0,
            successRate: 0,
            optimizations: {
                unchangedItemsSkipped: 0,
                duplicatesRemoved: 0,
                validationErrors: 0,
            },
        };
    }

    private generateOptimizationRecommendations(
        profiles: Array<[string, PerformanceProfile]>
    ): string[] {
        const recommendations: string[] = [];

        for (const [operation, profile] of profiles) {
            if (profile.averageProcessingTime > 5000) {
                recommendations.push(
                    `Consider reducing batch size for ${operation} operations (current avg: ${profile.averageProcessingTime}ms)`
                );
            }

            if (profile.memoryUsage > 80) {
                recommendations.push(
                    `High memory usage detected for ${operation} operations (${profile.memoryUsage}%)`
                );
            }

            if (profile.cpuUsage > 80) {
                recommendations.push(
                    `High CPU usage detected for ${operation} operations (${profile.cpuUsage}%)`
                );
            }
        }

        return recommendations;
    }

    private calculateAverageProcessingTime(
        metrics: Array<[string, BatchMetrics]>
    ): number {
        if (metrics.length === 0) return 0;

        const totalTime = metrics.reduce((sum, [, metric]) => sum + metric.totalProcessingTime, 0);
        const totalBatches = metrics.reduce((sum, [, metric]) => sum + metric.totalBatches, 0);

        return totalBatches > 0 ? totalTime / totalBatches : 0;
    }
}

// 타입 정의들
export interface SmartBatchOptions {
    batchSize?: number | 'auto';
    parallel?: boolean;
    maxConcurrency?: number;
    validate?: boolean;
    detectChanges?: boolean;
    softDelete?: boolean;
    optimistic?: boolean;
    cascade?: string[];
}

export interface BatchResult<T> {
    totalItems: number;
    successCount: number;
    failureCount: number;
    batchSize: number;
    processingTime: number;
    results: T[];
    errors: Array<{
        batchIndex: number;
        error: Error;
        affectedItems: any[];
    }>;
    metrics: BatchMetrics;
}

export interface BatchProgress {
    currentBatch: number;
    totalBatches: number;
    processedItems: number;
    totalItems: number;
    percentage: number;
    estimatedTimeRemaining: number;
}

export interface PerformanceProfile {
    operation: string;
    totalExecutions: number;
    averageProcessingTime: number;
    optimalBatchSize: number;
    memoryUsage: number;
    cpuUsage: number;
    lastUpdate: number;
}

export interface BatchMetrics {
    totalBatches: number;
    averageBatchSize: number;
    totalProcessingTime: number;
    successRate: number;
    optimizations: {
        unchangedItemsSkipped: number;
        duplicatesRemoved: number;
        validationErrors: number;
    };
}

export interface BatchPerformanceReport {
    profiles: PerformanceProfile[];
    recommendations: string[];
    totalOperations: number;
    averageProcessingTime: number;
}