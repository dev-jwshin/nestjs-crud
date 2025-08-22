/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 자동 응답 변환 클래스
 */
@Injectable()
export class ResponseTransformer {
    private static formatters = new Map<ResponseFormat, ResponseFormatter>();
    private static transformationRules = new Map<string, TransformationRule[]>();

    /**
     * 응답 포맷에 따른 자동 변환
     */
    static transform<T = any>(
        data: T,
        format: ResponseFormat,
        context?: TransformationContext
    ): any {
        const formatter = this.formatters.get(format);
        
        if (!formatter) {
            return data; // 기본 포맷으로 반환
        }

        return formatter(data, context);
    }

    /**
     * JSON:API 표준 포맷으로 변환
     */
    static toJsonApi<T = any>(
        data: T,
        context?: JsonApiContext
    ): JsonApiResponse<T> {
        const response: JsonApiResponse<T> = {
            data: this.transformToJsonApiData(data, context),
        };

        // 메타데이터 추가
        if (context?.meta) {
            response.meta = context.meta;
        }

        // 링크 정보 추가
        if (context?.links) {
            response.links = context.links;
        }

        // 포함된 리소스 추가
        if (context?.included) {
            response.included = context.included;
        }

        return response;
    }

    /**
     * HAL (Hypertext Application Language) 포맷으로 변환
     */
    static toHal<T = any>(
        data: T,
        context?: HalContext
    ): HalResponse<T> {
        const response: HalResponse<T> = {};

        if (Array.isArray(data)) {
            response._embedded = {
                [context?.collectionName || 'items']: data.map(item => 
                    this.addHalLinks(item, context)
                ),
            };

            // 컬렉션 메타데이터
            if (context?.meta) {
                response._meta = context.meta;
            }
        } else {
            Object.assign(response, data);
            this.addHalLinks(response, context);
        }

        return response;
    }

    /**
     * OData 포맷으로 변환
     */
    static toOData<T = any>(
        data: T,
        context?: ODataContext
    ): ODataResponse<T> {
        const response: ODataResponse<T> = {
            '@odata.context': context?.context || '$metadata#Collection',
        };

        if (Array.isArray(data)) {
            response.value = data;
            
            if (context?.count !== undefined) {
                response['@odata.count'] = context.count;
            }

            if (context?.nextLink) {
                response['@odata.nextLink'] = context.nextLink;
            }
        } else {
            Object.assign(response, data);
        }

        return response;
    }

    /**
     * GraphQL 스타일 응답으로 변환
     */
    static toGraphQL<T = any>(
        data: T,
        context?: GraphQLContext
    ): GraphQLResponse<T> {
        const response: GraphQLResponse<T> = {
            data,
        };

        if (context?.errors && context.errors.length > 0) {
            response.errors = context.errors;
        }

        if (context?.extensions) {
            response.extensions = context.extensions;
        }

        return response;
    }

    /**
     * 사용자 정의 포맷으로 변환
     */
    static toCustomFormat<T = any>(
        data: T,
        transformationRules: CustomTransformationRule[],
        context?: TransformationContext
    ): any {
        let result = data;

        for (const rule of transformationRules) {
            if (rule.condition && !rule.condition(result, context)) {
                continue;
            }

            result = rule.transformer(result, context);
        }

        return result;
    }

    /**
     * 요청 기반 자동 포맷 감지 및 변환
     */
    static autoTransform<T = any>(
        data: T,
        request: Request,
        options?: AutoTransformOptions
    ): any {
        const format = this.detectResponseFormat(request, options);
        const context = this.buildTransformationContext(data, request, options);

        return this.transform(data, format, context);
    }

    /**
     * NestJS ExecutionContext 기반 자동 변환
     */
    static transformFromContext<T = any>(
        data: T,
        context: ExecutionContext,
        options?: AutoTransformOptions
    ): any {
        const request = context.switchToHttp().getRequest<Request>();
        return this.autoTransform(data, request, options);
    }

    /**
     * 응답 포맷터 등록
     */
    static registerFormatter(
        format: ResponseFormat,
        formatter: ResponseFormatter
    ): void {
        this.formatters.set(format, formatter);
    }

    /**
     * 변환 규칙 등록
     */
    static registerTransformationRules(
        entityName: string,
        rules: TransformationRule[]
    ): void {
        this.transformationRules.set(entityName, rules);
    }

    /**
     * 배치 응답 변환
     */
    static transformBatch<T = any>(
        responses: Array<{ data: T; format: ResponseFormat; context?: TransformationContext }>,
        options?: BatchTransformOptions
    ): any[] {
        return responses.map(({ data, format, context }) => {
            try {
                return this.transform(data, format, context);
            } catch (error) {
                if (options?.continueOnError) {
                    return { error: (error as Error).message, originalData: data };
                }
                throw error;
            }
        });
    }

    /**
     * 조건부 응답 변환
     */
    static conditionalTransform<T = any>(
        data: T,
        conditions: ConditionalTransformation[],
        defaultFormat: ResponseFormat = 'default'
    ): any {
        for (const condition of conditions) {
            if (condition.predicate(data)) {
                return this.transform(data, condition.format, condition.context);
            }
        }

        return this.transform(data, defaultFormat);
    }

    // Private helper methods

    private static transformToJsonApiData<T>(
        data: T,
        context?: JsonApiContext
    ): JsonApiData<T> | JsonApiData<T>[] {
        if (Array.isArray(data)) {
            return data.map(item => this.createJsonApiResource(item, context));
        }

        return this.createJsonApiResource(data, context);
    }

    private static createJsonApiResource<T>(
        item: T,
        context?: JsonApiContext
    ): JsonApiData<T> {
        const resource: JsonApiData<T> = {
            type: context?.type || 'resource',
            id: this.extractId(item),
            attributes: this.extractAttributes(item, context?.excludeFromAttributes),
        };

        // 관계 정보 추가
        if (context?.relationships) {
            resource.relationships = this.buildRelationships(item, context.relationships);
        }

        // 링크 정보 추가
        if (context?.links) {
            resource.links = context.links;
        }

        return resource;
    }

    private static addHalLinks<T>(
        data: T,
        context?: HalContext
    ): T & { _links?: any } {
        const result = { ...data } as any;

        if (context?.selfLink) {
            result._links = {
                self: { href: context.selfLink },
            };
        }

        if (context?.additionalLinks) {
            result._links = {
                ...result._links,
                ...context.additionalLinks,
            };
        }

        return result;
    }

    private static detectResponseFormat(
        request: Request,
        options?: AutoTransformOptions
    ): ResponseFormat {
        // Accept 헤더 확인
        const acceptHeader = request.headers.accept;
        
        if (acceptHeader?.includes('application/vnd.api+json')) {
            return 'json-api';
        }
        
        if (acceptHeader?.includes('application/hal+json')) {
            return 'hal';
        }
        
        if (acceptHeader?.includes('application/json+odata')) {
            return 'odata';
        }

        // 쿼리 파라미터 확인
        const formatParam = request.query.format as string;
        if (formatParam && this.isValidFormat(formatParam)) {
            return formatParam as ResponseFormat;
        }

        // 기본값 또는 설정된 포맷
        return options?.defaultFormat || 'default';
    }

    private static buildTransformationContext<T>(
        data: T,
        request: Request,
        options?: AutoTransformOptions
    ): TransformationContext {
        return {
            request,
            user: (request as any).user,
            query: request.query,
            params: request.params,
            timestamp: Date.now(),
            ...options?.contextExtensions,
        };
    }

    private static isValidFormat(format: string): boolean {
        return ['default', 'json-api', 'hal', 'odata', 'graphql'].includes(format);
    }

    private static extractId(item: any): string | number {
        return item.id || item._id || item.uuid || '0';
    }

    private static extractAttributes(
        item: any,
        excludeFields: string[] = ['id', '_id', 'uuid']
    ): any {
        const attributes = { ...item };
        
        for (const field of excludeFields) {
            delete attributes[field];
        }

        return attributes;
    }

    private static buildRelationships(
        item: any,
        relationshipConfig: Record<string, RelationshipConfig>
    ): Record<string, any> {
        const relationships: Record<string, any> = {};

        for (const [key, config] of Object.entries(relationshipConfig)) {
            const relationData = item[key];
            
            if (relationData !== undefined) {
                relationships[key] = {
                    data: this.transformRelationshipData(relationData, config),
                };

                if (config.links) {
                    relationships[key].links = config.links;
                }
            }
        }

        return relationships;
    }

    private static transformRelationshipData(
        data: any,
        config: RelationshipConfig
    ): any {
        if (Array.isArray(data)) {
            return data.map(item => ({
                type: config.type,
                id: this.extractId(item),
            }));
        }

        return {
            type: config.type,
            id: this.extractId(data),
        };
    }
}

// 포맷터 등록 (기본값들)
ResponseTransformer.registerFormatter('json-api', ResponseTransformer.toJsonApi);
ResponseTransformer.registerFormatter('hal', ResponseTransformer.toHal);
ResponseTransformer.registerFormatter('odata', ResponseTransformer.toOData);
ResponseTransformer.registerFormatter('graphql', ResponseTransformer.toGraphQL);

// 타입 정의들
export type ResponseFormat = 'default' | 'json-api' | 'hal' | 'odata' | 'graphql' | 'custom';

export type ResponseFormatter = (data: any, context?: TransformationContext) => any;

export interface TransformationContext {
    request?: Request;
    user?: any;
    query?: any;
    params?: any;
    timestamp?: number;
    [key: string]: any;
}

export interface JsonApiContext extends TransformationContext {
    type?: string;
    meta?: any;
    links?: any;
    included?: any[];
    relationships?: Record<string, RelationshipConfig>;
    excludeFromAttributes?: string[];
}

export interface HalContext extends TransformationContext {
    selfLink?: string;
    additionalLinks?: Record<string, any>;
    collectionName?: string;
    meta?: any;
}

export interface ODataContext extends TransformationContext {
    context?: string;
    count?: number;
    nextLink?: string;
}

export interface GraphQLContext extends TransformationContext {
    errors?: any[];
    extensions?: any;
}

export interface RelationshipConfig {
    type: string;
    links?: any;
}

export interface JsonApiResponse<T> {
    data: JsonApiData<T> | JsonApiData<T>[];
    meta?: any;
    links?: any;
    included?: any[];
}

export interface JsonApiData<T> {
    type: string;
    id: string | number;
    attributes: Partial<T>;
    relationships?: Record<string, any>;
    links?: any;
}

export interface HalResponse<T> {
    _embedded?: {
        [key: string]: any[];
    };
    _links?: any;
    _meta?: any;
    [key: string]: any;
}

export interface ODataResponse<T> {
    '@odata.context': string;
    '@odata.count'?: number;
    '@odata.nextLink'?: string;
    value?: T[];
    [key: string]: any;
}

export interface GraphQLResponse<T> {
    data: T;
    errors?: any[];
    extensions?: any;
}

export interface TransformationRule {
    name: string;
    condition?: (data: any, context?: TransformationContext) => boolean;
    transformer: (data: any, context?: TransformationContext) => any;
}

export interface CustomTransformationRule {
    condition?: (data: any, context?: TransformationContext) => boolean;
    transformer: (data: any, context?: TransformationContext) => any;
}

export interface AutoTransformOptions {
    defaultFormat?: ResponseFormat;
    contextExtensions?: Record<string, any>;
}

export interface BatchTransformOptions {
    continueOnError?: boolean;
}

export interface ConditionalTransformation {
    predicate: (data: any) => boolean;
    format: ResponseFormat;
    context?: TransformationContext;
}