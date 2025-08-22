/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext } from '@nestjs/common';
import { ResponseFormat, SerializationOptions, CacheOptions } from '../decorator/conditional.decorator';

/**
 * 조건부 설정 데코레이터를 처리하는 헬퍼 클래스
 */
export class CrudConditionalHelper {
    /**
     * 역할 기반 필터링 적용
     */
    static applyRoleBasedFiltering(
        data: any,
        roles: string[],
        userRole?: string
    ): any {
        if (!userRole || !roles.includes(userRole)) {
            return data;
        }

        // 역할에 따른 추가 필터링 로직
        return data;
    }

    /**
     * 직렬화 옵션 적용
     */
    static applySerializationOptions(
        data: any,
        serialization: SerializationOptions,
        userRole?: string
    ): any {
        if (!userRole || !serialization[userRole]) {
            return data;
        }

        const allowedFields = serialization[userRole];
        
        if (Array.isArray(data)) {
            return data.map(item => this.filterFields(item, allowedFields));
        }

        return this.filterFields(data, allowedFields);
    }

    /**
     * 응답 포맷 변환
     */
    static transformResponseFormat(
        data: any,
        format: ResponseFormat,
        meta?: any
    ): any {
        switch (format) {
            case 'json-api':
                return this.toJsonApiFormat(data, meta);
            case 'hal':
                return this.toHalFormat(data, meta);
            case 'odata':
                return this.toODataFormat(data, meta);
            default:
                return data;
        }
    }

    /**
     * 캐시 키 생성
     */
    static generateCacheKey(
        cacheOptions: CacheOptions,
        context: ExecutionContext,
        additionalParams?: Record<string, any>
    ): string {
        if (cacheOptions.key) {
            return cacheOptions.key;
        }

        const request = context.switchToHttp().getRequest();
        const route = request.route?.path || request.url;
        const query = JSON.stringify(request.query || {});
        const params = JSON.stringify(additionalParams || {});

        return `crud:${route}:${query}:${params}`;
    }

    /**
     * 자동 관계 포함 처리
     */
    static processAutoInclude(
        queryBuilder: any,
        autoInclude: string[],
        alias: string = 'entity'
    ): any {
        for (const relation of autoInclude) {
            const relationParts = relation.split('.');
            let currentAlias = alias;

            for (let i = 0; i < relationParts.length; i++) {
                const relationName = relationParts[i];
                const nextAlias = `${currentAlias}_${relationName}`;

                if (i === 0) {
                    queryBuilder.leftJoinAndSelect(
                        `${currentAlias}.${relationName}`,
                        nextAlias
                    );
                } else {
                    queryBuilder.leftJoinAndSelect(
                        `${currentAlias}.${relationName}`,
                        nextAlias
                    );
                }

                currentAlias = nextAlias;
            }
        }

        return queryBuilder;
    }

    /**
     * 필드 필터링
     */
    private static filterFields(data: any, allowedFields: string[]): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const filtered: any = {};
        for (const field of allowedFields) {
            if (data.hasOwnProperty(field)) {
                filtered[field] = data[field];
            }
        }

        return filtered;
    }

    /**
     * JSON:API 포맷으로 변환
     */
    private static toJsonApiFormat(data: any, meta?: any): any {
        const result: any = {
            data: Array.isArray(data) 
                ? data.map(item => ({ type: 'resource', id: item.id, attributes: item }))
                : { type: 'resource', id: data.id, attributes: data }
        };

        if (meta) {
            result.meta = meta;
        }

        return result;
    }

    /**
     * HAL 포맷으로 변환
     */
    private static toHalFormat(data: any, meta?: any): any {
        const result: any = {
            _embedded: Array.isArray(data) ? { items: data } : data,
        };

        if (meta) {
            result._meta = meta;
        }

        return result;
    }

    /**
     * OData 포맷으로 변환
     */
    private static toODataFormat(data: any, meta?: any): any {
        const result: any = {
            '@odata.context': '$metadata#Collection',
            value: Array.isArray(data) ? data : [data],
        };

        if (meta?.total) {
            result['@odata.count'] = meta.total;
        }

        return result;
    }
}