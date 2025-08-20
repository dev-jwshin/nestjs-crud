import { instanceToPlain } from 'class-transformer';
import { 
    createCrudArrayResponse, 
    createCrudResponse,
    CrudResponse,
    CrudArrayResponse,
    CrudResponseMetadata
} from '../interface';

/**
 * Response factory with transformation caching to avoid redundant serialization
 */
export class ResponseFactory {
    private static transformCache = new WeakMap<object, any>();
    
    /**
     * Create a CRUD response with caching
     */
    static createResponse<T>(
        entities: T | T[], 
        options: { 
            excludedFields?: string[],
            metadata?: Partial<CrudResponseMetadata>
        } = {}
    ): CrudResponse<T> | CrudArrayResponse<T> {
        // Check cache for already transformed entities
        if (this.transformCache.has(entities as object)) {
            const cached = this.transformCache.get(entities as object);
            return Array.isArray(entities) 
                ? createCrudArrayResponse<T>(cached, options)
                : createCrudResponse<T>(cached, options);
        }
        
        // Transform entities to plain objects
        const transformed = instanceToPlain(entities);
        
        // Cache the transformation result
        this.transformCache.set(entities as object, transformed);
        
        // Create appropriate response type
        return Array.isArray(entities) 
            ? createCrudArrayResponse<T>(transformed as T[], options)
            : createCrudResponse<T>(transformed as T, options);
    }
    
    /**
     * Clear cache for specific entity or all cached transformations
     */
    static clearCache(entity?: object): void {
        if (entity) {
            this.transformCache.delete(entity);
        } else {
            // Create new WeakMap to clear all cache
            this.transformCache = new WeakMap<object, any>();
        }
    }
    
    /**
     * Transform entity to plain object with caching
     */
    static transformToPlain<T>(entity: T | T[]): any {
        if (this.transformCache.has(entity as object)) {
            return this.transformCache.get(entity as object);
        }
        
        const transformed = instanceToPlain(entity);
        this.transformCache.set(entity as object, transformed);
        
        return transformed;
    }
}