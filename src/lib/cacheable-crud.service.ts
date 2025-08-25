/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CrudService } from './crud.service';
import { 
    CrudOptions, 
    EntityType,
    CrudReadOneRequest,
    CrudResponse,
    CrudArrayResponse,
    CrudCreateOneRequest,
    CrudCreateManyRequest,
    CrudUpdateOneRequest,
    CrudUpdateManyRequest,
    CrudUpsertRequest,
    CrudUpsertManyRequest,
    CrudDeleteOneRequest,
    CrudDeleteManyRequest,
    CrudRecoverRequest,
    CrudRecoverManyRequest
} from './interface';
import { CrudReadManyRequest } from './request';
import { CRUD_OPTIONS_METADATA } from './constants';

// Simple in-memory cache implementation
class SimpleCache {
    private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
    
    async get<T>(key: string): Promise<T | undefined> {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        
        if (Date.now() - entry.timestamp > entry.ttl * 1000) {
            this.cache.delete(key);
            return undefined;
        }
        
        return entry.data;
    }
    
    async set(key: string, value: any, ttl: number = 300): Promise<void> {
        this.cache.set(key, {
            data: value,
            timestamp: Date.now(),
            ttl
        });
    }
    
    clear(): void {
        this.cache.clear();
    }
}

/**
 * CRUD Service with built-in caching support
 */
@Injectable()
export class CacheableCrudService<T extends EntityType> extends CrudService<T> {
    private cache?: SimpleCache;
    private cacheConfig?: CrudOptions['cache'];
    private cacheKeyPrefix: string;

    constructor(
        repository: Repository<T>,
        private options?: CrudOptions
    ) {
        super(repository);
        
        // Get cache config from options or metadata
        this.cacheConfig = this.options?.cache || this.getCacheConfigFromMetadata();
        
        if (this.cacheConfig?.enabled) {
            this.initializeCache();
        }
        
        this.cacheKeyPrefix = this.cacheConfig?.keyPrefix || 
                             `crud:${this.repository.metadata.tableName}`;
    }

    /**
     * Get cache configuration from class metadata
     */
    private getCacheConfigFromMetadata(): CrudOptions['cache'] | undefined {
        try {
            const metadata = Reflect.getMetadata(CRUD_OPTIONS_METADATA, this.constructor);
            return metadata?.cache;
        } catch {
            return undefined;
        }
    }

    /**
     * Initialize cache based on configuration
     */
    private initializeCache(): void {
        if (!this.cacheConfig) return;
        
        // For now, use simple in-memory cache
        // In production, this would integrate with Redis or other cache stores
        this.cache = new SimpleCache();
    }

    /**
     * Generate cache key for a request
     */
    private generateCacheKey(operation: string, params: any): string {
        const paramsStr = JSON.stringify(params || {});
        const hash = Buffer.from(paramsStr).toString('base64').slice(0, 16);
        return `${this.cacheKeyPrefix}:${operation}:${hash}`;
    }

    /**
     * Clear all cache entries for this entity
     */
    private async clearCache(): Promise<void> {
        if (!this.cache) return;
        
        // In a real implementation, we'd clear only relevant keys
        // For simplicity, we'll clear all cache
        this.cache.clear();
    }

    /**
     * Override handleShow with caching - arrow function to match parent
     */
    readonly handleShow = async (request: CrudReadOneRequest<T>): Promise<CrudResponse<T>> => {
        // If no cache, delegate to parent
        if (!this.cache) {
            // Call the parent's handleShow by accessing it directly
            const parentMethod = CrudService.prototype.handleShow;
            return parentMethod.call(this, request);
        }

        const cacheKey = this.generateCacheKey('show', request.params);
        
        // Try to get from cache
        const cached = await this.cache.get<CrudResponse<T>>(cacheKey);
        if (cached) {
            return cached;
        }

        // Get from database using parent method
        const parentMethod = CrudService.prototype.handleShow;
        const result = await parentMethod.call(this, request);
        
        // Store in cache
        if (result) {
            const ttl = this.cacheConfig?.ttl || 300;
            await this.cache.set(cacheKey, result, ttl);
        }

        return result;
    };

    /**
     * Override handleIndex with caching - arrow function to match parent
     */
    readonly handleIndex = async (request: CrudReadManyRequest<T>): Promise<CrudArrayResponse<T>> => {
        // If no cache, delegate to parent
        if (!this.cache) {
            const parentMethod = CrudService.prototype.handleIndex;
            return parentMethod.call(this, request);
        }

        const cacheKey = this.generateCacheKey('index', {
            findOptions: request.findOptions,
            pagination: request.pagination
        });
        
        // Try to get from cache
        const cached = await this.cache.get<CrudArrayResponse<T>>(cacheKey);
        if (cached) {
            return cached;
        }

        // Get from database using parent method
        const parentMethod = CrudService.prototype.handleIndex;
        const result = await parentMethod.call(this, request);
        
        // Store in cache
        if (result) {
            const ttl = this.cacheConfig?.ttl || 300;
            await this.cache.set(cacheKey, result, ttl);
        }

        return result;
    };

    /**
     * Override handleCreate to clear cache - arrow function to match parent
     */
    readonly handleCreate = async (request: CrudCreateOneRequest<T> | CrudCreateManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const parentMethod = CrudService.prototype.handleCreate;
        const result = await parentMethod.call(this, request);
        
        // Clear cache after successful create
        await this.clearCache();
        
        return result;
    };

    /**
     * Override handleUpdate to clear cache - arrow function to match parent
     */
    readonly handleUpdate = async (request: CrudUpdateOneRequest<T> | CrudUpdateManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const parentMethod = CrudService.prototype.handleUpdate;
        const result = await parentMethod.call(this, request);
        
        // Clear cache after successful update
        await this.clearCache();
        
        return result;
    };

    /**
     * Override handleUpsert to clear cache - arrow function to match parent
     */
    readonly handleUpsert = async (request: CrudUpsertRequest<T> | CrudUpsertManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const parentMethod = CrudService.prototype.handleUpsert;
        const result = await parentMethod.call(this, request);
        
        // Clear cache after successful upsert
        await this.clearCache();
        
        return result;
    };

    /**
     * Override handleDestroy to clear cache - arrow function to match parent
     */
    readonly handleDestroy = async (request: CrudDeleteOneRequest<T> | CrudDeleteManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const parentMethod = CrudService.prototype.handleDestroy;
        const result = await parentMethod.call(this, request);
        
        // Clear cache after successful delete
        await this.clearCache();
        
        return result;
    };

    /**
     * Override handleRecover to clear cache - arrow function to match parent
     */
    readonly handleRecover = async (request: CrudRecoverRequest<T> | CrudRecoverManyRequest<T>): Promise<CrudResponse<T> | CrudArrayResponse<T>> => {
        const parentMethod = CrudService.prototype.handleRecover;
        const result = await parentMethod.call(this, request);
        
        // Clear cache after successful recover
        await this.clearCache();
        
        return result;
    };
}