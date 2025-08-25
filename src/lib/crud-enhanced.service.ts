/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CrudService } from './crud.service';
import { AutoRelationDetector } from './utils/auto-relation-detector';
import { LazyRelationLoader } from './utils/lazy-relation-loader';
import { CrudOptions, EntityType } from './interface';
import { ExcludeFieldsUtil } from './utils/exclude-fields.util';
import _ from 'lodash';

/**
 * Enhanced CRUD Service with auto-relation detection, lazy loading, and exclude support
 * Note: Cache support is provided by CacheableCrudService
 */
@Injectable()
export class EnhancedCrudService<T extends EntityType> extends CrudService<T> {
    private crudOptions: CrudOptions;
    private lazyLoader?: LazyRelationLoader<T>;

    constructor(
        repository: Repository<T>,
        options?: CrudOptions
    ) {
        super(repository);
        this.crudOptions = options || {} as CrudOptions;

        // Initialize lazy loader if enabled
        if (this.crudOptions.lazyLoading) {
            this.lazyLoader = new LazyRelationLoader(repository);
        }
    }

    /**
     * Apply global exclude fields to response
     */
    private applyGlobalExclude(data: any): any {
        if (!this.crudOptions.exclude || this.crudOptions.exclude.length === 0) {
            return data;
        }

        return ExcludeFieldsUtil.exclude(data, this.crudOptions.exclude);
    }

    /**
     * Apply auto-relation detection to query builder
     */
    private applyAutoRelationDetection(
        queryBuilder: SelectQueryBuilder<T> | undefined,
        include: string[] | undefined
    ): void {
        if (!this.crudOptions.autoRelationDetection || !queryBuilder || !include) {
            return;
        }

        // Apply auto-optimization (synchronous)
        AutoRelationDetector.applyAutoOptimization(
            queryBuilder,
            include,
            {
                preventNPlusOne: true,
                handleLazyRelations: true,
                preventCircularReferences: true
            }
        );
    }

    /**
     * Override handleShow with enhancements - arrow function to match parent
     */
    readonly handleShow = async (request: any): Promise<any> => {
        // Apply auto-relation detection if enabled
        if (this.crudOptions.autoRelationDetection && request.queryBuilder) {
            this.applyAutoRelationDetection(request.queryBuilder, request.include);
        }

        // Call parent method
        const parentMethod = CrudService.prototype.handleShow;
        const result = await parentMethod.call(this, request);

        // Apply lazy loading if enabled
        if (this.lazyLoader && result?.data && request.include) {
            const loaded = await this.lazyLoader.loadRelationsOnDemand(
                result.data,
                request.include
            );
            result.data = loaded as T;
        }

        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };

    /**
     * Override handleIndex with enhancements - arrow function to match parent
     */
    readonly handleIndex = async (request: any): Promise<any> => {
        // Apply auto-relation detection if enabled
        if (this.crudOptions.autoRelationDetection && request.queryBuilder) {
            this.applyAutoRelationDetection(request.queryBuilder, request.include);
        }

        // Call parent method
        const parentMethod = CrudService.prototype.handleIndex;
        const result = await parentMethod.call(this, request);

        // Apply lazy loading if enabled
        if (this.lazyLoader && result?.data && request.include) {
            const loaded = await this.lazyLoader.loadRelationsOnDemand(
                result.data,
                request.include
            );
            result.data = loaded as T[];
        }

        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };

    /**
     * Override handleCreate with exclude support - arrow function to match parent
     */
    readonly handleCreate = async (request: any): Promise<any> => {
        const parentMethod = CrudService.prototype.handleCreate;
        const result = await parentMethod.call(this, request);
        
        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };

    /**
     * Override handleUpdate with exclude support - arrow function to match parent
     */
    readonly handleUpdate = async (request: any): Promise<any> => {
        const parentMethod = CrudService.prototype.handleUpdate;
        const result = await parentMethod.call(this, request);
        
        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };

    /**
     * Override handleUpsert with exclude support - arrow function to match parent
     */
    readonly handleUpsert = async (request: any): Promise<any> => {
        const parentMethod = CrudService.prototype.handleUpsert;
        const result = await parentMethod.call(this, request);
        
        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };

    /**
     * Override handleRecover with exclude support - arrow function to match parent
     */
    readonly handleRecover = async (request: any): Promise<any> => {
        const parentMethod = CrudService.prototype.handleRecover;
        const result = await parentMethod.call(this, request);
        
        // Apply global exclude
        if (result?.data) {
            result.data = this.applyGlobalExclude(result.data);
        }

        return result;
    };
}