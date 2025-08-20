import { SelectQueryBuilder, Repository, FindManyOptions, ObjectLiteral } from 'typeorm';
import { Request } from 'express';
import _ from 'lodash';

export interface PaginationOptions {
    page?: number;
    limit?: number;
    offset?: number;
    maxLimit?: number;
}

export interface FilterValue {
    $like?: string;
    $in?: any[];
    $not?: any;
    $ne?: any;
    $gt?: any;
    $gte?: any;
    $lt?: any;
    $lte?: any;
    $between?: [any, any];
}

export interface FilterOptions {
    [key: string]: any | FilterValue;
}

export interface SortOptions {
    field: string;
    order: 'ASC' | 'DESC';
}

export interface PaginationResult<T> {
    data: T[];
    metadata: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}

/**
 * CRUD Query Helper - 오버라이드된 route에서 사용할 수 있는 헬퍼 함수들
 */
export class CrudQueryHelper {
    /**
     * Request 객체에서 페이지네이션 파라미터 추출
     */
    static extractPaginationParams(req: Request, defaultLimit: number = 20): PaginationOptions {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(
            parseInt(req.query.limit as string) || defaultLimit,
            req.query.maxLimit ? parseInt(req.query.maxLimit as string) : 100
        );
        const offset = parseInt(req.query.offset as string) || (page - 1) * limit;

        return { page, limit, offset };
    }

    /**
     * Request 객체에서 필터 파라미터 추출
     */
    static extractFilterParams(req: Request, allowedFields?: string[]): FilterOptions {
        const filters: FilterOptions = {};
        const query = req.query;

        // where 파라미터 처리 (JSON 형식)
        if (query.where) {
            try {
                const whereFilter = typeof query.where === 'string' 
                    ? JSON.parse(query.where) 
                    : query.where;
                
                Object.assign(filters, whereFilter);
            } catch (e) {
                // JSON 파싱 실패 시 무시
            }
        }

        // 개별 필드 필터 처리
        Object.keys(query).forEach(key => {
            // 특수 파라미터 제외
            if (['page', 'limit', 'offset', 'sort', 'where', 'maxLimit'].includes(key)) {
                return;
            }

            // allowedFields가 지정된 경우 허용된 필드만 필터링
            if (allowedFields && !allowedFields.includes(key)) {
                return;
            }

            const value = query[key];
            
            // 특수 연산자 처리
            if (typeof value === 'string') {
                // LIKE 연산자 (와일드카드 *)
                if (value.includes('*')) {
                    filters[key] = { $like: value.replace(/\*/g, '%') };
                }
                // NULL 체크
                else if (value === 'null' || value === 'NULL') {
                    filters[key] = null;
                }
                // NOT NULL 체크
                else if (value === '!null' || value === '!NULL') {
                    filters[key] = { $not: null };
                }
                // 범위 연산자
                else if (value.startsWith('>=')) {
                    filters[key] = { $gte: value.substring(2) };
                }
                else if (value.startsWith('<=')) {
                    filters[key] = { $lte: value.substring(2) };
                }
                else if (value.startsWith('>')) {
                    filters[key] = { $gt: value.substring(1) };
                }
                else if (value.startsWith('<')) {
                    filters[key] = { $lt: value.substring(1) };
                }
                else if (value.startsWith('!=')) {
                    filters[key] = { $ne: value.substring(2) };
                }
                // IN 연산자 (콤마로 구분)
                else if (value.includes(',')) {
                    filters[key] = { $in: value.split(',').map(v => v.trim()) };
                }
                else {
                    filters[key] = value;
                }
            } else {
                filters[key] = value;
            }
        });

        return filters;
    }

    /**
     * Request 객체에서 정렬 파라미터 추출
     */
    static extractSortParams(req: Request): SortOptions[] {
        const sortOptions: SortOptions[] = [];
        const sort = req.query.sort;

        if (!sort) {
            return sortOptions;
        }

        const sortFields = Array.isArray(sort) ? sort : [sort];
        
        sortFields.forEach(field => {
            const fieldStr = String(field);
            if (fieldStr.startsWith('-')) {
                sortOptions.push({
                    field: fieldStr.substring(1),
                    order: 'DESC'
                });
            } else if (fieldStr.startsWith('+')) {
                sortOptions.push({
                    field: fieldStr.substring(1),
                    order: 'ASC'
                });
            } else {
                sortOptions.push({
                    field: fieldStr,
                    order: 'ASC'
                });
            }
        });

        return sortOptions;
    }

    /**
     * 필터를 QueryBuilder에 적용
     */
    static applyFiltersToQueryBuilder<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        filters: FilterOptions,
        alias?: string
    ): SelectQueryBuilder<T> {
        const entityAlias = alias || qb.alias;

        Object.keys(filters).forEach((key, index) => {
            const value = filters[key];
            const paramName = `filter_${key}_${index}`;

            if (value === null) {
                qb.andWhere(`${entityAlias}.${key} IS NULL`);
            } else if (_.isObject(value) && !Array.isArray(value)) {
                // 특수 연산자 처리
                const filterValue = value as FilterValue;
                if (filterValue.$like !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} LIKE :${paramName}`, { [paramName]: filterValue.$like });
                } else if (filterValue.$in !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} IN (:...${paramName})`, { [paramName]: filterValue.$in });
                } else if (filterValue.$not !== undefined) {
                    if (filterValue.$not === null) {
                        qb.andWhere(`${entityAlias}.${key} IS NOT NULL`);
                    } else {
                        qb.andWhere(`${entityAlias}.${key} != :${paramName}`, { [paramName]: filterValue.$not });
                    }
                } else if (filterValue.$ne !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} != :${paramName}`, { [paramName]: filterValue.$ne });
                } else if (filterValue.$gt !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} > :${paramName}`, { [paramName]: filterValue.$gt });
                } else if (filterValue.$gte !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} >= :${paramName}`, { [paramName]: filterValue.$gte });
                } else if (filterValue.$lt !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} < :${paramName}`, { [paramName]: filterValue.$lt });
                } else if (filterValue.$lte !== undefined) {
                    qb.andWhere(`${entityAlias}.${key} <= :${paramName}`, { [paramName]: filterValue.$lte });
                } else if (filterValue.$between !== undefined && Array.isArray(filterValue.$between)) {
                    qb.andWhere(`${entityAlias}.${key} BETWEEN :${paramName}_start AND :${paramName}_end`, {
                        [`${paramName}_start`]: filterValue.$between[0],
                        [`${paramName}_end`]: filterValue.$between[1]
                    });
                }
            } else {
                // 일반 값
                qb.andWhere(`${entityAlias}.${key} = :${paramName}`, { [paramName]: value });
            }
        });

        return qb;
    }

    /**
     * 정렬을 QueryBuilder에 적용
     */
    static applySortToQueryBuilder<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        sortOptions: SortOptions[],
        alias?: string
    ): SelectQueryBuilder<T> {
        const entityAlias = alias || qb.alias;

        sortOptions.forEach((sort, index) => {
            if (index === 0) {
                qb.orderBy(`${entityAlias}.${sort.field}`, sort.order);
            } else {
                qb.addOrderBy(`${entityAlias}.${sort.field}`, sort.order);
            }
        });

        return qb;
    }

    /**
     * 페이지네이션을 QueryBuilder에 적용
     */
    static async applyPaginationToQueryBuilder<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        pagination: PaginationOptions
    ): Promise<PaginationResult<T>> {
        const { page = 1, limit = 20, offset = 0 } = pagination;

        // 전체 개수 조회
        const total = await qb.getCount();

        // 페이지네이션 적용
        qb.skip(offset).take(limit);

        // 데이터 조회
        const data = await qb.getMany();

        const totalPages = Math.ceil(total / limit);

        return {
            data,
            metadata: {
                total,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrevious: page > 1
            }
        };
    }

    /**
     * Repository를 사용한 간단한 페이지네이션
     */
    static async paginate<T extends ObjectLiteral>(
        repository: Repository<T>,
        options: FindManyOptions<T> = {},
        pagination: PaginationOptions = {}
    ): Promise<PaginationResult<T>> {
        const { page = 1, limit = 20 } = pagination;
        const offset = (page - 1) * limit;

        const [data, total] = await repository.findAndCount({
            ...options,
            skip: offset,
            take: limit
        });

        const totalPages = Math.ceil(total / limit);

        return {
            data,
            metadata: {
                total,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrevious: page > 1
            }
        };
    }

    /**
     * Request에서 모든 쿼리 파라미터를 한번에 추출
     */
    static extractAllParams(req: Request, options?: {
        allowedFilterFields?: string[];
        defaultLimit?: number;
        maxLimit?: number;
    }) {
        const pagination = this.extractPaginationParams(req, options?.defaultLimit);
        const filters = this.extractFilterParams(req, options?.allowedFilterFields);
        const sort = this.extractSortParams(req);

        return {
            pagination,
            filters,
            sort
        };
    }

    /**
     * QueryBuilder에 모든 파라미터를 한번에 적용하고 결과 반환
     */
    static async applyAllToQueryBuilder<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        req: Request,
        options?: {
            allowedFilterFields?: string[];
            defaultLimit?: number;
            alias?: string;
        }
    ): Promise<PaginationResult<T>> {
        const { pagination, filters, sort } = this.extractAllParams(req, options);
        
        // 필터 적용
        this.applyFiltersToQueryBuilder(qb, filters, options?.alias);
        
        // 정렬 적용
        if (sort.length > 0) {
            this.applySortToQueryBuilder(qb, sort, options?.alias);
        }
        
        // 페이지네이션 적용 및 결과 반환
        return this.applyPaginationToQueryBuilder(qb, pagination);
    }
}