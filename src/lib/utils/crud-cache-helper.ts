/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext } from '@nestjs/common';

/**
 * CRUD 캐시 헬퍼 클래스
 */
export class CrudCacheHelper {
    private static memoryCache = new Map<string, CacheEntry>();
    private static cacheStats: CrudCacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalRequests: 0,
    };

    /**
     * 캐시에서 데이터 조회
     */
    static async get<T = any>(key: string, options?: CacheGetOptions): Promise<T | null> {
        this.cacheStats.totalRequests++;

        const entry = this.memoryCache.get(key);
        
        if (!entry) {
            this.cacheStats.misses++;
            return null;
        }

        // TTL 체크
        if (this.isExpired(entry)) {
            this.memoryCache.delete(key);
            this.cacheStats.misses++;
            this.cacheStats.evictions++;
            return null;
        }

        // 접근 시간 업데이트 (LRU)
        entry.lastAccessed = Date.now();
        entry.accessCount++;

        this.cacheStats.hits++;
        return entry.data as T;
    }

    /**
     * 캐시에 데이터 저장
     */
    static async set<T = any>(
        key: string, 
        data: T, 
        options?: CacheSetOptions
    ): Promise<void> {
        const ttl = options?.ttl || 300000; // 기본 5분
        const priority = options?.priority || 'normal';

        const entry: CacheEntry = {
            data,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            expiresAt: Date.now() + ttl,
            accessCount: 0,
            priority,
            tags: options?.tags || [],
        };

        this.memoryCache.set(key, entry);

        // 캐시 크기 관리
        await this.manageCapacity();
    }

    /**
     * 캐시에서 데이터 삭제
     */
    static async delete(key: string): Promise<boolean> {
        return this.memoryCache.delete(key);
    }

    /**
     * 태그 기반 캐시 무효화
     */
    static async invalidateByTag(tag: string): Promise<number> {
        let invalidatedCount = 0;

        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.tags.includes(tag)) {
                this.memoryCache.delete(key);
                invalidatedCount++;
            }
        }

        this.cacheStats.evictions += invalidatedCount;
        return invalidatedCount;
    }

    /**
     * 패턴 기반 캐시 무효화
     */
    static async invalidateByPattern(pattern: string): Promise<number> {
        let invalidatedCount = 0;
        const regex = new RegExp(pattern);

        for (const [key] of this.memoryCache.entries()) {
            if (regex.test(key)) {
                this.memoryCache.delete(key);
                invalidatedCount++;
            }
        }

        this.cacheStats.evictions += invalidatedCount;
        return invalidatedCount;
    }

    /**
     * 스마트 캐시 키 생성
     */
    static generateCacheKey(
        context: ExecutionContext,
        options?: CacheKeyOptions
    ): string {
        const request = context.switchToHttp().getRequest();
        const controller = context.getClass().name;
        const handler = context.getHandler().name;
        
        const baseKey = `${controller}:${handler}`;
        
        // URL 파라미터 포함
        const params = request.params ? JSON.stringify(request.params) : '';
        
        // 쿼리 파라미터 포함
        const query = request.query ? JSON.stringify(request.query) : '';
        
        // 사용자 정의 키 부분
        const customParts = options?.customParts || [];
        const customKey = customParts.length > 0 ? `:${customParts.join(':')}` : '';

        // 버전 정보
        const version = options?.version ? `:v${options.version}` : '';

        return `crud:${baseKey}${version}:${params}:${query}${customKey}`;
    }

    /**
     * 다층 캐시 전략 구현
     */
    static async getFromMultiLayer<T = any>(
        key: string,
        layers: CacheLayer[]
    ): Promise<T | null> {
        for (const layer of layers) {
            const data = await this.getFromLayer<T>(key, layer);
            if (data !== null) {
                // 상위 층에 데이터 복사 (캐시 승격)
                await this.promoteToUpperLayers(key, data, layers, layer);
                return data;
            }
        }
        return null;
    }

    /**
     * 다층 캐시에 데이터 저장
     */
    static async setToMultiLayer<T = any>(
        key: string,
        data: T,
        layers: CacheLayer[]
    ): Promise<void> {
        for (const layer of layers) {
            await this.setToLayer(key, data, layer);
        }
    }

    /**
     * 캐시 워밍업
     */
    static async warmup(
        keys: string[],
        dataProvider: (key: string) => Promise<any>
    ): Promise<void> {
        const warmupPromises = keys.map(async (key) => {
            try {
                const data = await dataProvider(key);
                await this.set(key, data);
            } catch (error) {
                console.warn(`Failed to warm up cache for key: ${key}`, error);
            }
        });

        await Promise.allSettled(warmupPromises);
    }

    /**
     * 캐시 통계 조회
     */
    static getStats(): CrudCacheStats & { hitRatio: number; size: number } {
        const hitRatio = this.cacheStats.totalRequests > 0 
            ? (this.cacheStats.hits / this.cacheStats.totalRequests) * 100 
            : 0;

        return {
            ...this.cacheStats,
            hitRatio: Math.round(hitRatio * 100) / 100,
            size: this.memoryCache.size,
        };
    }

    /**
     * 캐시 정리
     */
    static async cleanup(): Promise<number> {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, entry] of this.memoryCache.entries()) {
            if (this.isExpired(entry)) {
                this.memoryCache.delete(key);
                cleanedCount++;
            }
        }

        this.cacheStats.evictions += cleanedCount;
        return cleanedCount;
    }

    /**
     * 캐시 초기화
     */
    static clear(): void {
        this.memoryCache.clear();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            totalRequests: 0,
        };
    }

    // Private helper methods

    private static isExpired(entry: CacheEntry): boolean {
        return Date.now() > entry.expiresAt;
    }

    private static async manageCapacity(): Promise<void> {
        const maxSize = 1000; // 최대 캐시 크기
        
        if (this.memoryCache.size <= maxSize) return;

        // LRU 방식으로 오래된 항목 제거
        const entries = Array.from(this.memoryCache.entries());
        
        // 접근 시간 기준 정렬
        entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

        // 가장 오래된 항목들 제거
        const toRemove = entries.slice(0, Math.floor(maxSize * 0.1));
        
        for (const [key] of toRemove) {
            this.memoryCache.delete(key);
            this.cacheStats.evictions++;
        }
    }

    private static async getFromLayer<T>(
        key: string,
        layer: CacheLayer
    ): Promise<T | null> {
        switch (layer.type) {
            case 'memory':
                return await this.get<T>(key);
            case 'redis':
                // Redis 구현 (실제 환경에서는 Redis 클라이언트 사용)
                return null;
            case 'database':
                // 데이터베이스 캐시 구현
                return null;
            default:
                return null;
        }
    }

    private static async setToLayer<T>(
        key: string,
        data: T,
        layer: CacheLayer
    ): Promise<void> {
        const options: CacheSetOptions = {
            ttl: layer.ttl,
        };

        switch (layer.type) {
            case 'memory':
                await this.set(key, data, options);
                break;
            case 'redis':
                // Redis 구현
                break;
            case 'database':
                // 데이터베이스 캐시 구현
                break;
        }
    }

    private static async promoteToUpperLayers<T>(
        key: string,
        data: T,
        allLayers: CacheLayer[],
        currentLayer: CacheLayer
    ): Promise<void> {
        const currentIndex = allLayers.indexOf(currentLayer);
        const upperLayers = allLayers.slice(0, currentIndex);

        for (const layer of upperLayers) {
            await this.setToLayer(key, data, layer);
        }
    }
}

/**
 * 캐시 데코레이터
 */
export function CacheResult(options?: CacheDecoratorOptions) {
    return function (
        target: any,
        propertyName: string,
        descriptor: PropertyDescriptor
    ) {
        const method = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const cacheKey = options?.keyGenerator 
                ? options.keyGenerator(...args)
                : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;

            // 캐시에서 조회 시도
            const cachedResult = await CrudCacheHelper.get(cacheKey);
            if (cachedResult !== null) {
                return cachedResult;
            }

            // 캐시 미스 시 실제 메서드 실행
            const result = await method.apply(this, args);

            // 결과를 캐시에 저장
            await CrudCacheHelper.set(cacheKey, result, {
                ttl: options?.ttl,
                tags: options?.tags,
            });

            return result;
        };
    };
}

// 타입 정의들
export interface CacheEntry {
    data: any;
    createdAt: number;
    lastAccessed: number;
    expiresAt: number;
    accessCount: number;
    priority: 'low' | 'normal' | 'high';
    tags: string[];
}

export interface CacheGetOptions {
    fallback?: () => Promise<any>;
}

export interface CacheSetOptions {
    ttl?: number;
    priority?: 'low' | 'normal' | 'high';
    tags?: string[];
}

export interface CacheKeyOptions {
    customParts?: string[];
    version?: string;
    includeUser?: boolean;
}

export interface CacheLayer {
    type: 'memory' | 'redis' | 'database';
    ttl: number;
}

export interface CrudCacheStats {
    hits: number;
    misses: number;
    evictions: number;
    totalRequests: number;
}

export interface CacheDecoratorOptions {
    ttl?: number;
    keyGenerator?: (...args: any[]) => string;
    tags?: string[];
}