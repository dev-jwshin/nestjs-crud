/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
// Redis는 선택적 의존성으로 처리
type Redis = any;
declare const RedisConstructor: any;

export interface CacheLayer {
    name: string;
    priority: number;
    maxSize?: number;
    ttl: number;
    strategy: CacheStrategy;
    storage: CacheStorage;
}

export type CacheStrategy = 'lru' | 'lfu' | 'fifo' | 'ttl' | 'adaptive';
export type CacheStorage = 'memory' | 'redis' | 'file' | 'database';

export interface CacheEntry<T = any> {
    value: T;
    timestamp: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
    size: number;
    metadata: CacheMetadata;
}

export interface CacheMetadata {
    tags: string[];
    source: string;
    compressed: boolean;
    version: number;
    dependencies: string[];
}

export interface CacheOptions {
    layers?: CacheLayer[];
    defaultTtl?: number;
    compression?: boolean;
    encryption?: boolean;
    metrics?: boolean;
    invalidation?: InvalidationStrategy;
}

export interface InvalidationStrategy {
    type: 'tag' | 'pattern' | 'dependency' | 'time';
    rules: InvalidationRule[];
}

export interface InvalidationRule {
    pattern: string;
    condition: string;
    action: 'delete' | 'refresh' | 'expire';
}

export interface CacheStats {
    layer: string;
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
    evictions: number;
    lastEviction?: Date;
}

export interface CacheMetrics {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    layers: CacheStats[];
    performance: PerformanceMetrics;
}

export interface PerformanceMetrics {
    avgGetTime: number;
    avgSetTime: number;
    avgDeleteTime: number;
    maxGetTime: number;
    maxSetTime: number;
    maxDeleteTime: number;
}

/**
 * 다층 캐시 시스템
 */
@Injectable()
export class MultiTierCache implements OnModuleDestroy {
    private readonly logger = new Logger(MultiTierCache.name);
    private layers: Map<string, CacheLayerInstance> = new Map();
    private metrics: CacheMetrics;
    private isInitialized = false;

    constructor(private readonly options: CacheOptions = {}) {
        this.initializeMetrics();
    }

    /**
     * 캐시 시스템 초기화
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        const defaultLayers: CacheLayer[] = this.options.layers || [
            {
                name: 'L1_Memory',
                priority: 1,
                maxSize: 1000,
                ttl: 300, // 5분
                strategy: 'lru',
                storage: 'memory'
            },
            {
                name: 'L2_Redis',
                priority: 2,
                maxSize: 10000,
                ttl: 3600, // 1시간
                strategy: 'lru',
                storage: 'redis'
            },
            {
                name: 'L3_Database',
                priority: 3,
                ttl: 86400, // 24시간
                strategy: 'ttl',
                storage: 'database'
            }
        ];

        for (const layerConfig of defaultLayers) {
            const layer = await this.createCacheLayer(layerConfig);
            this.layers.set(layerConfig.name, layer);
        }

        this.isInitialized = true;
        this.logger.log(`다층 캐시 시스템 초기화 완료: ${this.layers.size}개 레이어`);
    }

    /**
     * 캐시에서 값 조회
     */
    async get<T>(key: string, options?: { bypassLayers?: string[] }): Promise<T | null> {
        const startTime = process.hrtime.bigint();
        
        try {
            const layersToCheck = this.getSortedLayers()
                .filter(layer => !options?.bypassLayers?.includes(layer.name));

            for (const layer of layersToCheck) {
                const entry = await layer.get<T>(key);
                
                if (entry !== null) {
                    // 상위 레이어에 복사 (캐시 워밍)
                    await this.promoteToUpperLayers(key, entry, layer.name);
                    
                    this.updateHitMetrics(layer.name);
                    this.updatePerformanceMetrics('get', startTime);
                    
                    return entry.value;
                }
                
                this.updateMissMetrics(layer.name);
            }

            this.updatePerformanceMetrics('get', startTime);
            return null;
            
        } catch (error) {
            this.logger.error(`캐시 조회 실패: ${key}`, (error as Error).stack);
            this.updatePerformanceMetrics('get', startTime);
            return null;
        }
    }

    /**
     * 캐시에 값 저장
     */
    async set<T>(
        key: string,
        value: T,
        options?: {
            ttl?: number;
            tags?: string[];
            compress?: boolean;
            layers?: string[];
        }
    ): Promise<void> {
        const startTime = process.hrtime.bigint();
        
        try {
            const entry: CacheEntry<T> = {
                value,
                timestamp: Date.now(),
                ttl: options?.ttl || this.options.defaultTtl || 3600,
                accessCount: 0,
                lastAccessed: Date.now(),
                size: this.estimateSize(value),
                metadata: {
                    tags: options?.tags || [],
                    source: 'application',
                    compressed: options?.compress || false,
                    version: 1,
                    dependencies: []
                }
            };

            const layersToSet = options?.layers ? 
                this.getLayersByNames(options.layers) : 
                this.getSortedLayers();

            const promises = layersToSet.map(layer => layer.set(key, entry));
            await Promise.allSettled(promises);

            this.updatePerformanceMetrics('set', startTime);
            
        } catch (error) {
            this.logger.error(`캐시 저장 실패: ${key}`, (error as Error).stack);
            this.updatePerformanceMetrics('set', startTime);
        }
    }

    /**
     * 캐시에서 값 삭제
     */
    async delete(key: string, options?: { layers?: string[] }): Promise<void> {
        const startTime = process.hrtime.bigint();
        
        try {
            const layersToDelete = options?.layers ? 
                this.getLayersByNames(options.layers) : 
                this.getSortedLayers();

            const promises = layersToDelete.map(layer => layer.delete(key));
            await Promise.allSettled(promises);

            this.updatePerformanceMetrics('delete', startTime);
            
        } catch (error) {
            this.logger.error(`캐시 삭제 실패: ${key}`, (error as Error).stack);
            this.updatePerformanceMetrics('delete', startTime);
        }
    }

    /**
     * 태그 기반 무효화
     */
    async invalidateByTag(tag: string): Promise<void> {
        this.logger.log(`태그 기반 무효화: ${tag}`);
        
        const promises = this.getSortedLayers().map(layer => layer.invalidateByTag(tag));
        await Promise.allSettled(promises);
    }

    /**
     * 패턴 기반 무효화
     */
    async invalidateByPattern(pattern: string): Promise<void> {
        this.logger.log(`패턴 기반 무효화: ${pattern}`);
        
        const promises = this.getSortedLayers().map(layer => layer.invalidateByPattern(pattern));
        await Promise.allSettled(promises);
    }

    /**
     * 캐시 통계 조회
     */
    async getMetrics(): Promise<CacheMetrics> {
        const layerStats = await Promise.all(
            this.getSortedLayers().map(layer => layer.getStats())
        );

        this.metrics.layers = layerStats;
        this.metrics.totalHits = layerStats.reduce((sum, stats) => sum + stats.hits, 0);
        this.metrics.totalMisses = layerStats.reduce((sum, stats) => sum + stats.misses, 0);
        this.metrics.overallHitRate = this.metrics.totalHits / 
            (this.metrics.totalHits + this.metrics.totalMisses) * 100;

        return { ...this.metrics };
    }

    /**
     * 캐시 워밍
     */
    async warmup(keys: string[], dataProvider: (key: string) => Promise<any>): Promise<void> {
        this.logger.log(`캐시 워밍 시작: ${keys.length}개 키`);
        
        const batchSize = 10;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            
            const promises = batch.map(async (key) => {
                try {
                    const data = await dataProvider(key);
                    await this.set(key, data);
                } catch (error) {
                    this.logger.warn(`캐시 워밍 실패: ${key}`, (error as Error).message);
                }
            });
            
            await Promise.allSettled(promises);
        }
        
        this.logger.log('캐시 워밍 완료');
    }

    /**
     * 캐시 최적화
     */
    async optimize(): Promise<void> {
        this.logger.log('캐시 최적화 시작');
        
        for (const layer of this.getSortedLayers()) {
            await layer.optimize();
        }
        
        this.logger.log('캐시 최적화 완료');
    }

    /**
     * 캐시 비우기
     */
    async flush(options?: { layers?: string[] }): Promise<void> {
        const layersToFlush = options?.layers ? 
            this.getLayersByNames(options.layers) : 
            this.getSortedLayers();

        const promises = layersToFlush.map(layer => layer.flush());
        await Promise.allSettled(promises);
        
        this.logger.log(`캐시 플러시 완료: ${layersToFlush.length}개 레이어`);
    }

    /**
     * 모듈 종료 시 정리
     */
    async onModuleDestroy(): Promise<void> {
        for (const layer of this.layers.values()) {
            await layer.close();
        }
        this.logger.log('다층 캐시 시스템 종료');
    }

    /**
     * 캐시 레이어 생성
     */
    private async createCacheLayer(config: CacheLayer): Promise<CacheLayerInstance> {
        switch (config.storage) {
            case 'memory':
                return new MemoryCacheLayer(config);
            case 'redis':
                return new RedisCacheLayer(config);
            case 'file':
                return new FileCacheLayer(config);
            case 'database':
                return new DatabaseCacheLayer(config);
            default:
                throw new Error(`지원하지 않는 캐시 스토리지: ${config.storage}`);
        }
    }

    /**
     * 상위 레이어로 승격
     */
    private async promoteToUpperLayers(
        key: string,
        entry: CacheEntry,
        currentLayerName: string
    ): Promise<void> {
        const currentLayer = this.layers.get(currentLayerName);
        if (!currentLayer) return;

        const upperLayers = this.getSortedLayers()
            .filter(layer => layer.priority < currentLayer.priority);

        for (const layer of upperLayers) {
            try {
                await layer.set(key, entry);
            } catch (error) {
                this.logger.warn(`상위 레이어 승격 실패: ${layer.name}`, (error as Error).message);
            }
        }
    }

    /**
     * 우선순위별 레이어 정렬
     */
    private getSortedLayers(): CacheLayerInstance[] {
        return Array.from(this.layers.values())
            .sort((a, b) => a.priority - b.priority);
    }

    /**
     * 이름으로 레이어 조회
     */
    private getLayersByNames(names: string[]): CacheLayerInstance[] {
        return names
            .map(name => this.layers.get(name))
            .filter(layer => layer !== undefined) as CacheLayerInstance[];
    }

    /**
     * 메트릭 초기화
     */
    private initializeMetrics(): void {
        this.metrics = {
            totalHits: 0,
            totalMisses: 0,
            overallHitRate: 0,
            layers: [],
            performance: {
                avgGetTime: 0,
                avgSetTime: 0,
                avgDeleteTime: 0,
                maxGetTime: 0,
                maxSetTime: 0,
                maxDeleteTime: 0
            }
        };
    }

    /**
     * 히트 메트릭 업데이트
     */
    private updateHitMetrics(layerName: string): void {
        this.metrics.totalHits++;
    }

    /**
     * 미스 메트릭 업데이트
     */
    private updateMissMetrics(layerName: string): void {
        this.metrics.totalMisses++;
    }

    /**
     * 성능 메트릭 업데이트
     */
    private updatePerformanceMetrics(operation: 'get' | 'set' | 'delete', startTime: bigint): void {
        const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // ms
        
        switch (operation) {
            case 'get':
                this.metrics.performance.maxGetTime = Math.max(this.metrics.performance.maxGetTime, duration);
                break;
            case 'set':
                this.metrics.performance.maxSetTime = Math.max(this.metrics.performance.maxSetTime, duration);
                break;
            case 'delete':
                this.metrics.performance.maxDeleteTime = Math.max(this.metrics.performance.maxDeleteTime, duration);
                break;
        }
    }

    /**
     * 객체 크기 추정
     */
    private estimateSize(value: any): number {
        const str = JSON.stringify(value);
        return new Blob([str]).size;
    }
}

/**
 * 캐시 레이어 인터페이스
 */
abstract class CacheLayerInstance {
    constructor(
        public readonly config: CacheLayer,
        public readonly name: string = config.name,
        public readonly priority: number = config.priority
    ) {}

    abstract get<T>(key: string): Promise<CacheEntry<T> | null>;
    abstract set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
    abstract delete(key: string): Promise<void>;
    abstract invalidateByTag(tag: string): Promise<void>;
    abstract invalidateByPattern(pattern: string): Promise<void>;
    abstract getStats(): Promise<CacheStats>;
    abstract optimize(): Promise<void>;
    abstract flush(): Promise<void>;
    abstract close(): Promise<void>;
}

/**
 * 메모리 캐시 레이어
 */
class MemoryCacheLayer extends CacheLayerInstance {
    private cache = new Map<string, CacheEntry>();
    private stats: CacheStats;

    constructor(config: CacheLayer) {
        super(config);
        this.initializeStats();
    }

    async get<T>(key: string): Promise<CacheEntry<T> | null> {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // TTL 확인
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.stats.hits++;
        
        return entry as CacheEntry<T>;
    }

    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
        // 크기 제한 확인
        if (this.config.maxSize && this.cache.size >= this.config.maxSize) {
            await this.evict();
        }

        this.cache.set(key, entry);
        this.stats.size = this.cache.size;
    }

    async delete(key: string): Promise<void> {
        this.cache.delete(key);
        this.stats.size = this.cache.size;
    }

    async invalidateByTag(tag: string): Promise<void> {
        const keysToDelete: string[] = [];
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.metadata.tags.includes(tag)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));
        this.stats.size = this.cache.size;
    }

    async invalidateByPattern(pattern: string): Promise<void> {
        const regex = new RegExp(pattern);
        const keysToDelete: string[] = [];
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));
        this.stats.size = this.cache.size;
    }

    async getStats(): Promise<CacheStats> {
        this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0;
        return { ...this.stats };
    }

    async optimize(): Promise<void> {
        // 만료된 항목 정리
        const expiredKeys: string[] = [];
        
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => this.cache.delete(key));
        this.stats.size = this.cache.size;
    }

    async flush(): Promise<void> {
        this.cache.clear();
        this.initializeStats();
    }

    async close(): Promise<void> {
        this.cache.clear();
    }

    /**
     * 캐시 퇴출
     */
    private async evict(): Promise<void> {
        let keyToEvict: string | null = null;
        
        switch (this.config.strategy) {
            case 'lru':
                keyToEvict = this.findLRUKey();
                break;
            case 'lfu':
                keyToEvict = this.findLFUKey();
                break;
            case 'fifo':
                keyToEvict = this.findFIFOKey();
                break;
            default:
                keyToEvict = this.cache.keys().next().value || null;
        }
        
        if (keyToEvict) {
            this.cache.delete(keyToEvict);
            this.stats.evictions++;
            this.stats.lastEviction = new Date();
        }
    }

    private findLRUKey(): string | null {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        
        return oldestKey;
    }

    private findLFUKey(): string | null {
        let leastUsedKey: string | null = null;
        let leastCount = Infinity;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.accessCount < leastCount) {
                leastCount = entry.accessCount;
                leastUsedKey = key;
            }
        }
        
        return leastUsedKey;
    }

    private findFIFOKey(): string | null {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }
        
        return oldestKey;
    }

    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl * 1000;
    }

    private initializeStats(): void {
        this.stats = {
            layer: this.name,
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            maxSize: this.config.maxSize || 0,
            evictions: 0
        };
    }
}

/**
 * Redis 캐시 레이어
 */
class RedisCacheLayer extends CacheLayerInstance {
    private redis: Redis;
    private stats: CacheStats;

    constructor(config: CacheLayer) {
        super(config);
        try {
            const Redis = require('ioredis');
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3
            });
        } catch (error) {
            // Redis not available, use fallback
            this.redis = null;
        }
        this.initializeStats();
    }

    async get<T>(key: string): Promise<CacheEntry<T> | null> {
        try {
            const data = await this.redis.get(key);
            
            if (!data) {
                this.stats.misses++;
                return null;
            }

            const entry: CacheEntry<T> = JSON.parse(data);
            entry.accessCount++;
            entry.lastAccessed = Date.now();
            
            // 업데이트된 엔트리 저장
            await this.redis.set(key, JSON.stringify(entry), 'EX', entry.ttl);
            
            this.stats.hits++;
            return entry;
            
        } catch (error) {
            this.stats.misses++;
            return null;
        }
    }

    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
        try {
            await this.redis.set(key, JSON.stringify(entry), 'EX', entry.ttl);
            this.stats.size++;
        } catch (error) {
            // Redis 저장 실패 로깅
        }
    }

    async delete(key: string): Promise<void> {
        await this.redis.del(key);
        this.stats.size = Math.max(0, this.stats.size - 1);
    }

    async invalidateByTag(tag: string): Promise<void> {
        const keys = await this.redis.keys('*');
        const keysToDelete: string[] = [];
        
        for (const key of keys) {
            try {
                const data = await this.redis.get(key);
                if (data) {
                    const entry: CacheEntry = JSON.parse(data);
                    if (entry.metadata.tags.includes(tag)) {
                        keysToDelete.push(key);
                    }
                }
            } catch (error) {
                // 파싱 실패한 키는 건너뛰기
            }
        }
        
        if (keysToDelete.length > 0) {
            await this.redis.del(...keysToDelete);
        }
    }

    async invalidateByPattern(pattern: string): Promise<void> {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }

    async getStats(): Promise<CacheStats> {
        try {
            const info = await this.redis.info('keyspace');
            const dbMatch = info.match(/db0:keys=(\d+)/);
            this.stats.size = dbMatch ? parseInt(dbMatch[1]) : 0;
        } catch (error) {
            // Redis 정보 조회 실패
        }
        
        this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0;
        return { ...this.stats };
    }

    async optimize(): Promise<void> {
        // Redis는 자체적으로 만료된 키를 정리하므로 별도 작업 불필요
    }

    async flush(): Promise<void> {
        await this.redis.flushdb();
        this.initializeStats();
    }

    async close(): Promise<void> {
        await this.redis.quit();
    }

    private initializeStats(): void {
        this.stats = {
            layer: this.name,
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            maxSize: this.config.maxSize || 0,
            evictions: 0
        };
    }
}

/**
 * 파일 캐시 레이어
 */
class FileCacheLayer extends CacheLayerInstance {
    private stats: CacheStats;

    constructor(config: CacheLayer) {
        super(config);
        this.initializeStats();
    }

    async get<T>(key: string): Promise<CacheEntry<T> | null> {
        // 파일 시스템 캐시 구현
        this.stats.misses++;
        return null;
    }

    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
        // 파일 시스템 캐시 저장 구현
    }

    async delete(key: string): Promise<void> {
        // 파일 삭제 구현
    }

    async invalidateByTag(tag: string): Promise<void> {
        // 태그 기반 파일 삭제 구현
    }

    async invalidateByPattern(pattern: string): Promise<void> {
        // 패턴 기반 파일 삭제 구현
    }

    async getStats(): Promise<CacheStats> {
        return { ...this.stats };
    }

    async optimize(): Promise<void> {
        // 파일 시스템 정리
    }

    async flush(): Promise<void> {
        // 모든 캐시 파일 삭제
    }

    async close(): Promise<void> {
        // 정리 작업
    }

    private initializeStats(): void {
        this.stats = {
            layer: this.name,
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            maxSize: this.config.maxSize || 0,
            evictions: 0
        };
    }
}

/**
 * 데이터베이스 캐시 레이어
 */
class DatabaseCacheLayer extends CacheLayerInstance {
    private stats: CacheStats;

    constructor(config: CacheLayer) {
        super(config);
        this.initializeStats();
    }

    async get<T>(key: string): Promise<CacheEntry<T> | null> {
        // 데이터베이스 캐시 조회 구현
        this.stats.misses++;
        return null;
    }

    async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
        // 데이터베이스 캐시 저장 구현
    }

    async delete(key: string): Promise<void> {
        // 데이터베이스 캐시 삭제 구현
    }

    async invalidateByTag(tag: string): Promise<void> {
        // 태그 기반 삭제 구현
    }

    async invalidateByPattern(pattern: string): Promise<void> {
        // 패턴 기반 삭제 구현
    }

    async getStats(): Promise<CacheStats> {
        return { ...this.stats };
    }

    async optimize(): Promise<void> {
        // 데이터베이스 최적화
    }

    async flush(): Promise<void> {
        // 모든 캐시 데이터 삭제
    }

    async close(): Promise<void> {
        // 연결 정리
    }

    private initializeStats(): void {
        this.stats = {
            layer: this.name,
            hits: 0,
            misses: 0,
            hitRate: 0,
            size: 0,
            maxSize: this.config.maxSize || 0,
            evictions: 0
        };
    }
}

/**
 * 캐시 데코레이터
 */
export function CacheResult(options: {
    key?: string;
    ttl?: number;
    tags?: string[];
    layers?: string[];
}) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const cache = (this as any).cache as MultiTierCache;
            if (!cache) return method.apply(this, args);
            
            const key = options.key || `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;
            
            // 캐시에서 조회
            const cached = await cache.get(key);
            if (cached !== null) return cached;
            
            // 메서드 실행
            const result = await method.apply(this, args);
            
            // 캐시에 저장
            await cache.set(key, result, {
                ttl: options.ttl,
                tags: options.tags,
                layers: options.layers
            });
            
            return result;
        };
    };
}