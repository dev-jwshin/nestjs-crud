import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { Repository, DeepPartial, ObjectLiteral } from 'typeorm';
import { Request } from 'express';
import _ from 'lodash';
import { CrudOptions, LifecycleHooks, HookContext, Method } from '../interface';

/**
 * CrudOperationHelper - route 오버라이드 시에도 CRUD의 핵심 기능을 사용할 수 있게 하는 헬퍼
 * 
 * 주요 기능:
 * - Entity validation (class-validator decorators)
 * - Allowed params filtering
 * - Lifecycle hooks execution
 * - Transform and exclude fields
 */
export class CrudOperationHelper<T extends ObjectLiteral = any> {
    constructor(
        private readonly repository: Repository<T>,
        private readonly crudOptions: CrudOptions
    ) {}

    /**
     * Entity validation using class-validator
     * Entity의 validation decorator를 실행합니다
     */
    async validateEntity(
        data: any,
        options?: {
            skipMissingProperties?: boolean;
            whitelist?: boolean;
            forbidNonWhitelisted?: boolean;
            groups?: string[];
        }
    ): Promise<T> {
        const entity = this.crudOptions.entity as any;
        
        // Transform plain object to entity instance
        const instance = plainToInstance(entity, data);
        
        // Validate using class-validator
        const errors = await validate(instance, {
            skipMissingProperties: options?.skipMissingProperties ?? false,
            whitelist: options?.whitelist ?? true,
            forbidNonWhitelisted: options?.forbidNonWhitelisted ?? true,
            forbidUnknownValues: false,
            groups: options?.groups,
        });

        if (errors.length > 0) {
            throw new UnprocessableEntityException(this.formatValidationErrors(errors));
        }

        return instance as unknown as T;
    }

    /**
     * Validate entity for update (skip missing properties by default)
     */
    async validateForUpdate(
        data: any,
        options?: {
            whitelist?: boolean;
            forbidNonWhitelisted?: boolean;
            groups?: string[];
        }
    ): Promise<Partial<T>> {
        return this.validateEntity(data, {
            ...options,
            skipMissingProperties: true, // UPDATE는 기본적으로 partial update
        });
    }

    /**
     * Filter allowed params
     * allowedParams 설정에 따라 필드를 필터링합니다
     */
    filterAllowedParams(
        data: any,
        operation?: 'create' | 'update' | 'upsert',
        customAllowedParams?: string[]
    ): any {
        // Priority: custom > route-specific > global
        const routeOptions = operation ? this.crudOptions.routes?.[operation] : undefined;
        const allowedParams = customAllowedParams ?? 
                             routeOptions?.allowedParams ?? 
                             this.crudOptions.allowedParams;
        
        if (!allowedParams || allowedParams.length === 0) {
            return data;
        }

        if (!data || typeof data !== 'object') {
            return data;
        }

        // Array handling (bulk operations)
        if (Array.isArray(data)) {
            return data.map(item => this.filterSingleItem(item, allowedParams));
        }

        return this.filterSingleItem(data, allowedParams);
    }

    private filterSingleItem(item: any, allowedParams: string[]): any {
        if (!item || typeof item !== 'object') {
            return item;
        }

        const filtered: any = {};
        for (const key of Object.keys(item)) {
            if (allowedParams.includes(key)) {
                filtered[key] = item[key];
            }
        }
        return filtered;
    }

    /**
     * Exclude fields from entity
     * exclude 설정에 따라 필드를 제외합니다
     */
    excludeFields(
        entity: T | T[],
        operation?: 'create' | 'update' | 'upsert' | 'show' | 'destroy',
        customExclude?: string[]
    ): any {
        const routeOptions = operation ? this.crudOptions.routes?.[operation] : undefined;
        const excludeFields = customExclude ?? 
                             routeOptions?.exclude ?? 
                             [];

        if (excludeFields.length === 0) {
            return entity;
        }

        if (Array.isArray(entity)) {
            return entity.map(item => this.excludeSingleEntity(item, excludeFields));
        }

        return this.excludeSingleEntity(entity, excludeFields);
    }

    private excludeSingleEntity(entity: T, excludeFields: string[]): any {
        const result = { ...entity };
        for (const field of excludeFields) {
            delete result[field];
        }
        return result;
    }

    /**
     * Execute lifecycle hooks
     * 라이프사이클 훅을 실행합니다
     */
    async executeHooks(
        hookType: keyof LifecycleHooks<T>,
        data: any,
        additionalData?: any,
        context?: HookContext<T>
    ): Promise<any> {
        const hooks = this.getHooksForOperation(context?.operation);
        const hook = hooks?.[hookType] as any;

        if (!hook || typeof hook !== 'function') {
            return data;
        }

        try {
            // Some hooks take 3 parameters (entity, body, context)
            if (hookType === 'assignAfter' && additionalData) {
                const result = await hook(data, additionalData, context || { operation: 'create' as Method });
                return result;
            }
            // Most hooks take 2 parameters (data, context)
            const result = await hook(data, context || { operation: 'create' as Method });
            return result;
        } catch (error) {
            console.error(`Error executing hook ${hookType}:`, error);
            throw error;
        }
    }

    private getHooksForOperation(operation?: Method): LifecycleHooks<T> | undefined {
        if (!operation) {
            return undefined;
        }

        const route = this.crudOptions.routes?.[operation];
        return (route as any)?.hooks;
    }

    /**
     * Create operation with CRUD features
     * CRUD의 모든 기능을 사용하여 생성 작업을 수행합니다
     */
    async create(
        data: any,
        options?: {
            allowedParams?: string[];
            exclude?: string[];
            hooks?: LifecycleHooks<T>;
            validate?: boolean;
        }
    ): Promise<T> {
        const context: HookContext<T> = {
            operation: 'create' as Method,
        };

        // 1. Filter allowed params
        let filteredData = this.filterAllowedParams(data, 'create', options?.allowedParams);

        // 2. Execute assignBefore hook
        if (options?.hooks?.assignBefore) {
            filteredData = await options.hooks.assignBefore(filteredData as DeepPartial<T>, context);
        }

        // 3. Validate entity
        if (options?.validate !== false) {
            filteredData = await this.validateEntity(filteredData);
        }

        // 4. Create entity instance
        const entity = this.repository.create(filteredData as DeepPartial<T>);

        // 5. Execute assignAfter hook
        let processedEntity = entity;
        if (options?.hooks?.assignAfter) {
            processedEntity = await options.hooks.assignAfter(entity, filteredData as DeepPartial<T>, context);
        }

        // 6. Execute saveBefore hook
        if (options?.hooks?.saveBefore) {
            processedEntity = await options.hooks.saveBefore(processedEntity, context);
        }

        // 7. Save entity
        const savedEntity = await this.repository.save(processedEntity);

        // 8. Execute saveAfter hook
        let finalEntity = savedEntity;
        if (options?.hooks?.saveAfter) {
            finalEntity = await options.hooks.saveAfter(savedEntity, context);
        }

        // 9. Exclude fields
        return this.excludeFields(finalEntity, 'create', options?.exclude);
    }

    /**
     * Update operation with CRUD features
     */
    async update(
        id: any,
        data: any,
        options?: {
            allowedParams?: string[];
            exclude?: string[];
            hooks?: LifecycleHooks<T>;
            validate?: boolean;
        }
    ): Promise<T> {
        // Find existing entity
        const primaryKey = this.repository.metadata.primaryColumns[0].propertyName;
        const existingEntity = await this.repository.findOne({
            where: { [primaryKey]: id } as any
        });

        if (!existingEntity) {
            throw new BadRequestException(`Entity with ${primaryKey}=${id} not found`);
        }

        const context: HookContext<T> = {
            operation: 'update' as Method,
            currentEntity: existingEntity,
        };

        // 1. Filter allowed params
        let filteredData = this.filterAllowedParams(data, 'update', options?.allowedParams);

        // 2. Execute assignBefore hook
        if (options?.hooks?.assignBefore) {
            filteredData = await options.hooks.assignBefore(existingEntity, context);
        }

        // 3. Validate entity (partial update)
        if (options?.validate !== false) {
            filteredData = await this.validateForUpdate(filteredData);
        }

        // 4. Merge with existing entity
        const mergedEntity = { ...existingEntity, ...filteredData };

        // 5. Execute assignAfter hook
        let processedEntity = mergedEntity;
        if (options?.hooks?.assignAfter) {
            processedEntity = await options.hooks.assignAfter(mergedEntity, filteredData as DeepPartial<T>, context);
        }

        // 6. Execute saveBefore hook
        if (options?.hooks?.saveBefore) {
            processedEntity = await options.hooks.saveBefore(processedEntity, context);
        }

        // 7. Save entity
        const savedEntity = await this.repository.save(processedEntity);

        // 8. Execute saveAfter hook
        let finalEntity = savedEntity;
        if (options?.hooks?.saveAfter) {
            finalEntity = await options.hooks.saveAfter(savedEntity, context);
        }

        // 9. Exclude fields
        return this.excludeFields(finalEntity, 'update', options?.exclude);
    }

    /**
     * Bulk create with CRUD features
     */
    async bulkCreate(
        dataArray: any[],
        options?: {
            allowedParams?: string[];
            exclude?: string[];
            hooks?: LifecycleHooks<T>;
            validate?: boolean;
            batchSize?: number;
        }
    ): Promise<T[]> {
        const results: T[] = [];
        const batchSize = options?.batchSize || 50;

        // Process in batches
        for (let i = 0; i < dataArray.length; i += batchSize) {
            const batch = dataArray.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(data => this.create(data, options))
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Bulk update with CRUD features
     */
    async bulkUpdate(
        updates: Array<{ id: any; [key: string]: any }>,
        options?: {
            allowedParams?: string[];
            exclude?: string[];
            hooks?: LifecycleHooks<T>;
            validate?: boolean;
            batchSize?: number;
        }
    ): Promise<T[]> {
        const results: T[] = [];
        const batchSize = options?.batchSize || 50;

        // Process in batches
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(({ id, ...data }) => this.update(id, data, options))
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Format validation errors for better readability
     */
    private formatValidationErrors(errors: ValidationError[]): any {
        const formattedErrors: any = {};
        
        errors.forEach(error => {
            const property = error.property;
            const constraints = error.constraints;
            
            if (constraints) {
                formattedErrors[property] = Object.values(constraints);
            }
            
            // Handle nested validation errors
            if (error.children && error.children.length > 0) {
                formattedErrors[property] = {
                    ...formattedErrors[property],
                    nested: this.formatValidationErrors(error.children)
                };
            }
        });
        
        return formattedErrors;
    }

    /**
     * Extract and validate request body with CRUD features
     */
    async processRequestBody(
        req: Request,
        operation: 'create' | 'update' | 'upsert',
        options?: {
            allowedParams?: string[];
            validate?: boolean;
        }
    ): Promise<any> {
        let body = req.body;

        // 1. Filter allowed params
        body = this.filterAllowedParams(body, operation, options?.allowedParams);

        // 2. Validate
        if (options?.validate !== false) {
            if (operation === 'update') {
                body = await this.validateForUpdate(body);
            } else {
                body = await this.validateEntity(body);
            }
        }

        return body;
    }

    /**
     * Get metadata about the entity
     */
    getEntityMetadata() {
        return {
            tableName: this.repository.metadata.tableName,
            primaryKey: this.repository.metadata.primaryColumns[0].propertyName,
            columns: this.repository.metadata.columns.map(col => ({
                propertyName: col.propertyName,
                databaseName: col.databaseName,
                type: col.type,
                isNullable: col.isNullable,
                isPrimary: col.isPrimary,
            })),
            relations: this.repository.metadata.relations.map(rel => ({
                propertyName: rel.propertyName,
                relationType: rel.relationType,
                inverseEntityMetadata: rel.inverseEntityMetadata.tableName,
            })),
        };
    }
}