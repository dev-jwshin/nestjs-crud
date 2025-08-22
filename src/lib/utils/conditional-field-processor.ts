/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * 조건부 필드 포함 처리 클래스
 */
@Injectable()
export class ConditionalFieldProcessor {
    private static fieldRules = new Map<string, FieldRule[]>();
    private static userContextProviders = new Map<string, UserContextProvider>();

    /**
     * 사용자 역할 기반 필드 포함/제외 처리
     */
    static processFieldsByRole<T = any>(
        data: T,
        userRole: string,
        entityName: string,
        options?: FieldProcessingOptions
    ): T {
        const rules = this.fieldRules.get(entityName) || [];
        const applicableRules = rules.filter(rule => 
            this.isRuleApplicable(rule, userRole, options?.context)
        );

        if (Array.isArray(data)) {
            return data.map(item => this.applyRulesToItem(item, applicableRules)) as unknown as T;
        }

        return this.applyRulesToItem(data, applicableRules);
    }

    /**
     * 동적 필드 필터링 (런타임 조건 기반)
     */
    static processDynamicFields<T = any>(
        data: T,
        conditions: FieldCondition[],
        context: FieldContext
    ): T {
        if (Array.isArray(data)) {
            return data.map(item => this.applyDynamicConditions(item, conditions, context)) as unknown as T;
        }

        return this.applyDynamicConditions(data, conditions, context);
    }

    /**
     * 요청 기반 필드 선택 (GraphQL 스타일)
     */
    static processSelectiveFields<T = any>(
        data: T,
        fieldSelector: FieldSelector,
        options?: SelectiveFieldOptions
    ): Partial<T> {
        if (Array.isArray(data)) {
            return data.map(item => this.selectFields(item, fieldSelector, options)) as unknown as Partial<T>;
        }

        return this.selectFields(data, fieldSelector, options);
    }

    /**
     * 지연 로딩 필드 처리
     */
    static processLazyFields<T = any>(
        data: T,
        lazyFieldConfig: LazyFieldConfig,
        resolver: LazyFieldResolver
    ): Promise<T> {
        if (Array.isArray(data)) {
            return Promise.all(
                data.map(item => this.resolveLazyFields(item, lazyFieldConfig, resolver))
            ) as unknown as Promise<T>;
        }

        return this.resolveLazyFields(data, lazyFieldConfig, resolver);
    }

    /**
     * 계산된 필드 추가
     */
    static processComputedFields<T = any>(
        data: T,
        computedFields: ComputedFieldDefinition[],
        context: ComputationContext
    ): T & Record<string, any> {
        if (Array.isArray(data)) {
            return data.map(item => this.addComputedFields(item, computedFields, context)) as unknown as T & Record<string, any>;
        }

        return this.addComputedFields(data, computedFields, context);
    }

    /**
     * 보안 민감 필드 마스킹
     */
    static processSensitiveFields<T = any>(
        data: T,
        sensitiveFields: string[],
        maskingStrategy: MaskingStrategy = 'asterisk'
    ): T {
        if (Array.isArray(data)) {
            return data.map(item => this.maskSensitiveFields(item, sensitiveFields, maskingStrategy)) as unknown as T;
        }

        return this.maskSensitiveFields(data, sensitiveFields, maskingStrategy);
    }

    /**
     * 필드 변환 (포맷팅, 타입 변환 등)
     */
    static processFieldTransformations<T = any>(
        data: T,
        transformations: FieldTransformation[],
        options?: TransformationOptions
    ): T {
        if (Array.isArray(data)) {
            return data.map(item => this.applyTransformations(item, transformations, options)) as unknown as T;
        }

        return this.applyTransformations(data, transformations, options);
    }

    /**
     * 필드 규칙 등록
     */
    static registerFieldRules(entityName: string, rules: FieldRule[]): void {
        this.fieldRules.set(entityName, rules);
    }

    /**
     * 사용자 컨텍스트 제공자 등록
     */
    static registerUserContextProvider(name: string, provider: UserContextProvider): void {
        this.userContextProviders.set(name, provider);
    }

    /**
     * Express 요청에서 필드 처리 적용
     */
    static processFromRequest<T = any>(
        data: T,
        request: Request,
        entityName: string,
        options?: RequestProcessingOptions
    ): Promise<T> {
        return this.processFromContext(data, { switchToHttp: () => ({ getRequest: () => request }) } as any, entityName, options);
    }

    /**
     * NestJS ExecutionContext에서 필드 처리 적용
     */
    static async processFromContext<T = any>(
        data: T,
        context: ExecutionContext,
        entityName: string,
        options?: RequestProcessingOptions
    ): Promise<T> {
        const request = context.switchToHttp().getRequest();
        
        // 사용자 정보 추출
        const userInfo = await this.extractUserInfo(request, options?.userExtractor);
        
        // 필드 선택자 추출
        const fieldSelector = this.extractFieldSelector(request, options?.fieldSelectorParam);
        
        // 조건부 필드 처리
        let processedData = data;

        // 1. 역할 기반 필드 처리
        if (userInfo?.role) {
            processedData = this.processFieldsByRole(processedData, userInfo.role, entityName, {
                context: userInfo,
            });
        }

        // 2. 선택적 필드 처리
        if (fieldSelector) {
            processedData = this.processSelectiveFields(processedData, fieldSelector, {
                allowNestedSelection: options?.allowNestedSelection,
            }) as T;
        }

        // 3. 민감 필드 마스킹
        if (options?.sensitiveFields?.length) {
            processedData = this.processSensitiveFields(
                processedData,
                options.sensitiveFields,
                options.maskingStrategy
            );
        }

        // 4. 계산된 필드 추가
        if (options?.computedFields?.length) {
            processedData = this.processComputedFields(processedData, options.computedFields, {
                user: userInfo,
                request,
                timestamp: Date.now(),
            }) as T;
        }

        // 5. 필드 변환
        if (options?.transformations?.length) {
            processedData = this.processFieldTransformations(processedData, options.transformations);
        }

        return processedData;
    }

    // Private helper methods

    private static isRuleApplicable(
        rule: FieldRule,
        userRole: string,
        context?: any
    ): boolean {
        // 역할 검사
        if (rule.roles && !rule.roles.includes(userRole)) {
            return false;
        }

        // 조건 검사
        if (rule.condition && !rule.condition(context)) {
            return false;
        }

        return true;
    }

    private static applyRulesToItem<T>(item: T, rules: FieldRule[]): T {
        const result = { ...item } as any;

        for (const rule of rules) {
            switch (rule.action) {
                case 'include':
                    // 포함할 필드만 유지
                    if (rule.fields) {
                        const allowedFields = rule.fields;
                        for (const key of Object.keys(result)) {
                            if (!allowedFields.includes(key)) {
                                delete result[key];
                            }
                        }
                    }
                    break;

                case 'exclude':
                    // 제외할 필드 삭제
                    if (rule.fields) {
                        for (const field of rule.fields) {
                            delete result[field];
                        }
                    }
                    break;

                case 'mask':
                    // 필드 마스킹
                    if (rule.fields) {
                        for (const field of rule.fields) {
                            if (result[field] !== undefined) {
                                result[field] = this.maskValue(result[field], rule.maskingStrategy);
                            }
                        }
                    }
                    break;
            }
        }

        return result;
    }

    private static applyDynamicConditions<T>(
        item: T,
        conditions: FieldCondition[],
        context: FieldContext
    ): T {
        const result = { ...item } as any;

        for (const condition of conditions) {
            const shouldInclude = condition.evaluator(result, context);
            
            if (!shouldInclude) {
                if (condition.action === 'exclude') {
                    delete result[condition.fieldName];
                } else if (condition.action === 'mask') {
                    result[condition.fieldName] = this.maskValue(
                        result[condition.fieldName],
                        condition.maskingStrategy
                    );
                }
            }
        }

        return result;
    }

    private static selectFields<T>(
        item: T,
        selector: FieldSelector,
        options?: SelectiveFieldOptions
    ): Partial<T> {
        const result = {} as any;

        for (const fieldPath of selector.fields) {
            if (fieldPath.includes('.') && options?.allowNestedSelection) {
                this.setNestedField(result, fieldPath, this.getNestedField(item, fieldPath));
            } else if (!fieldPath.includes('.')) {
                result[fieldPath] = (item as any)[fieldPath];
            }
        }

        return result;
    }

    private static async resolveLazyFields<T>(
        item: T,
        config: LazyFieldConfig,
        resolver: LazyFieldResolver
    ): Promise<T> {
        const result = { ...item } as any;

        for (const lazyField of config.fields) {
            if (config.shouldResolve(lazyField, item)) {
                try {
                    result[lazyField] = await resolver(lazyField, item);
                } catch (error) {
                    if (config.onError === 'ignore') {
                        continue;
                    } else if (config.onError === 'null') {
                        result[lazyField] = null;
                    } else {
                        throw error;
                    }
                }
            }
        }

        return result;
    }

    private static addComputedFields<T>(
        item: T,
        computedFields: ComputedFieldDefinition[],
        context: ComputationContext
    ): T & Record<string, any> {
        const result = { ...item } as any;

        for (const computedField of computedFields) {
            try {
                result[computedField.name] = computedField.compute(item, context);
            } catch (error) {
                if (computedField.onError === 'ignore') {
                    continue;
                } else if (computedField.onError === 'null') {
                    result[computedField.name] = null;
                } else {
                    throw error;
                }
            }
        }

        return result;
    }

    private static maskSensitiveFields<T>(
        item: T,
        sensitiveFields: string[],
        strategy: MaskingStrategy
    ): T {
        const result = { ...item } as any;

        for (const field of sensitiveFields) {
            if (result[field] !== undefined) {
                result[field] = this.maskValue(result[field], strategy);
            }
        }

        return result;
    }

    private static applyTransformations<T>(
        item: T,
        transformations: FieldTransformation[],
        options?: TransformationOptions
    ): T {
        const result = { ...item } as any;

        for (const transformation of transformations) {
            if (result[transformation.fieldName] !== undefined) {
                try {
                    result[transformation.fieldName] = transformation.transform(
                        result[transformation.fieldName],
                        item,
                        options
                    );
                } catch (error) {
                    if (transformation.onError === 'ignore') {
                        continue;
                    } else if (transformation.onError === 'revert') {
                        // 원래 값 유지
                        continue;
                    } else {
                        throw error;
                    }
                }
            }
        }

        return result;
    }

    private static maskValue(value: any, strategy?: MaskingStrategy): any {
        if (value == null) return value;

        switch (strategy) {
            case 'asterisk':
                return '*'.repeat(String(value).length);
            case 'partial':
                const str = String(value);
                if (str.length <= 4) return '*'.repeat(str.length);
                return str.substring(0, 2) + '*'.repeat(str.length - 4) + str.substring(str.length - 2);
            case 'hash':
                return `[HASH:${this.simpleHash(String(value))}]`;
            case 'null':
                return null;
            case 'redacted':
                return '[REDACTED]';
            default:
                return '***';
        }
    }

    private static simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    private static getNestedField(obj: any, path: string): any {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    private static setNestedField(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        const lastKey = keys.pop()!;
        const target = keys.reduce((current, key) => {
            if (!(key in current)) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    private static async extractUserInfo(
        request: Request,
        extractor?: UserInfoExtractor
    ): Promise<UserInfo | null> {
        if (extractor) {
            return await extractor(request);
        }

        // 기본 사용자 정보 추출 로직
        const user = (request as any).user;
        if (user) {
            return {
                id: user.id,
                role: user.role || 'user',
                permissions: user.permissions || [],
                metadata: user,
            };
        }

        return null;
    }

    private static extractFieldSelector(
        request: Request,
        paramName: string = 'fields'
    ): FieldSelector | null {
        const fieldsParam = request.query[paramName] as string;
        
        if (!fieldsParam) return null;

        const fields = fieldsParam.split(',').map(field => field.trim()).filter(Boolean);
        
        return {
            fields,
            mode: 'include', // 기본값
        };
    }
}

// 타입 정의들
export interface FieldRule {
    action: 'include' | 'exclude' | 'mask';
    fields?: string[];
    roles?: string[];
    condition?: (context: any) => boolean;
    maskingStrategy?: MaskingStrategy;
}

export interface FieldCondition {
    fieldName: string;
    action: 'exclude' | 'mask';
    evaluator: (item: any, context: FieldContext) => boolean;
    maskingStrategy?: MaskingStrategy;
}

export interface FieldSelector {
    fields: string[];
    mode: 'include' | 'exclude';
}

export interface LazyFieldConfig {
    fields: string[];
    shouldResolve: (fieldName: string, item: any) => boolean;
    onError: 'throw' | 'ignore' | 'null';
}

export interface ComputedFieldDefinition {
    name: string;
    compute: (item: any, context: ComputationContext) => any;
    onError: 'throw' | 'ignore' | 'null';
}

export interface FieldTransformation {
    fieldName: string;
    transform: (value: any, item: any, options?: TransformationOptions) => any;
    onError: 'throw' | 'ignore' | 'revert';
}

export type MaskingStrategy = 'asterisk' | 'partial' | 'hash' | 'null' | 'redacted';

export interface FieldProcessingOptions {
    context?: any;
}

export interface SelectiveFieldOptions {
    allowNestedSelection?: boolean;
}

export interface TransformationOptions {
    locale?: string;
    timezone?: string;
    format?: string;
}

export interface RequestProcessingOptions {
    userExtractor?: UserInfoExtractor;
    fieldSelectorParam?: string;
    allowNestedSelection?: boolean;
    sensitiveFields?: string[];
    maskingStrategy?: MaskingStrategy;
    computedFields?: ComputedFieldDefinition[];
    transformations?: FieldTransformation[];
}

export interface FieldContext {
    user?: UserInfo;
    request?: Request;
    timestamp: number;
    [key: string]: any;
}

export interface ComputationContext {
    user?: UserInfo | null;
    request?: Request;
    timestamp: number;
    [key: string]: any;
}

export interface UserInfo {
    id: string | number;
    role: string;
    permissions: string[];
    metadata?: any;
}

export type UserInfoExtractor = (request: Request) => Promise<UserInfo | null>;
export type UserContextProvider = (request: Request) => Promise<any>;
export type LazyFieldResolver = (fieldName: string, item: any) => Promise<any>;