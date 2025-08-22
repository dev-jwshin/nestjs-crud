/* eslint-disable @typescript-eslint/no-explicit-any */
import { Repository, SelectQueryBuilder, ObjectLiteral, FindManyOptions } from 'typeorm';
import { CrudQueryHelper, PaginationOptions, FilterOptions, SortOptions, PaginationResult } from './crud-query-helper';

/**
 * 메서드 체이닝이 가능한 CRUD 쿼리 빌더
 */
export class CrudQueryBuilder<T extends ObjectLiteral = any> {
    private queryBuilder?: SelectQueryBuilder<T>;
    private repository: Repository<T>;
    private alias: string;
    private filters: FilterOptions = {};
    private sorts: SortOptions[] = [];
    private includes: string[] = [];
    private pagination?: PaginationOptions;
    private entity: any;

    constructor(entity: any, repository: Repository<T>, alias: string = 'entity') {
        this.entity = entity;
        this.repository = repository;
        this.alias = alias;
    }

    /**
     * 엔티티를 지정하여 쿼리 시작
     */
    from(entity: any): this {
        this.entity = entity;
        this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        return this;
    }

    /**
     * WHERE 조건 추가 (체이닝 가능)
     */
    where(field: string, value?: any): CrudQueryCondition<T> {
        return new CrudQueryCondition<T>(this, field, value);
    }

    /**
     * 관계 포함 (include/join)
     */
    include(relations: string[] | string): this {
        const relationArray = Array.isArray(relations) ? relations : [relations];
        this.includes.push(...relationArray);
        return this;
    }

    /**
     * 정렬 추가
     */
    sort(...fields: string[]): this {
        for (const field of fields) {
            if (field.startsWith('-')) {
                this.sorts.push({ field: field.substring(1), order: 'DESC' });
            } else if (field.startsWith('+')) {
                this.sorts.push({ field: field.substring(1), order: 'ASC' });
            } else {
                this.sorts.push({ field, order: 'ASC' });
            }
        }
        return this;
    }

    /**
     * 내림차순 정렬
     */
    orderByDesc(field: string): this {
        this.sorts.push({ field, order: 'DESC' });
        return this;
    }

    /**
     * 오름차순 정렬
     */
    orderByAsc(field: string): this {
        this.sorts.push({ field, order: 'ASC' });
        return this;
    }

    /**
     * 페이지네이션 설정
     */
    paginate(options: PaginationOptions): this {
        this.pagination = options;
        return this;
    }

    /**
     * 페이지 설정
     */
    page(page: number, limit: number = 20): this {
        this.pagination = { page, limit };
        return this;
    }

    /**
     * 제한 설정
     */
    limit(limit: number): this {
        this.pagination = { ...this.pagination, limit };
        return this;
    }

    /**
     * 오프셋 설정
     */
    offset(offset: number): this {
        this.pagination = { ...this.pagination, offset };
        return this;
    }

    /**
     * 쿼리 실행 (페이지네이션 포함)
     */
    async execute(): Promise<PaginationResult<T>> {
        if (!this.queryBuilder) {
            this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        }

        // 관계 포함
        this.applyIncludes();

        // 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(this.queryBuilder, this.filters, this.alias);

        // 정렬 적용
        if (this.sorts.length > 0) {
            CrudQueryHelper.applySortToQueryBuilder(this.queryBuilder, this.sorts, this.alias);
        }

        // 페이지네이션 적용
        const paginationOptions = this.pagination || { page: 1, limit: 20 };
        return await CrudQueryHelper.applyPaginationToQueryBuilder(this.queryBuilder, paginationOptions);
    }

    /**
     * 단일 결과 조회
     */
    async first(): Promise<T | null> {
        if (!this.queryBuilder) {
            this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        }

        // 관계 포함
        this.applyIncludes();

        // 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(this.queryBuilder, this.filters, this.alias);

        // 정렬 적용
        if (this.sorts.length > 0) {
            CrudQueryHelper.applySortToQueryBuilder(this.queryBuilder, this.sorts, this.alias);
        }

        return await this.queryBuilder.getOne();
    }

    /**
     * 개수 조회
     */
    async count(): Promise<number> {
        if (!this.queryBuilder) {
            this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        }

        // 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(this.queryBuilder, this.filters, this.alias);

        return await this.queryBuilder.getCount();
    }

    /**
     * 모든 결과 조회 (페이지네이션 없음)
     */
    async getMany(): Promise<T[]> {
        if (!this.queryBuilder) {
            this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        }

        // 관계 포함
        this.applyIncludes();

        // 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(this.queryBuilder, this.filters, this.alias);

        // 정렬 적용
        if (this.sorts.length > 0) {
            CrudQueryHelper.applySortToQueryBuilder(this.queryBuilder, this.sorts, this.alias);
        }

        return await this.queryBuilder.getMany();
    }

    /**
     * 원시 쿼리 빌더 가져오기
     */
    getQueryBuilder(): SelectQueryBuilder<T> {
        if (!this.queryBuilder) {
            this.queryBuilder = this.repository.createQueryBuilder(this.alias);
        }
        return this.queryBuilder;
    }

    /**
     * 필터 내부 설정 (CrudQueryCondition에서 사용)
     */
    addFilter(field: string, value: any): this {
        this.filters[field] = value;
        return this;
    }

    /**
     * 관계 포함 적용
     */
    private applyIncludes(): void {
        if (!this.queryBuilder) return;

        for (const relation of this.includes) {
            const relationParts = relation.split('.');
            let currentAlias = this.alias;

            for (let i = 0; i < relationParts.length; i++) {
                const relationName = relationParts[i];
                const nextAlias = `${currentAlias}_${relationName}`;

                this.queryBuilder.leftJoinAndSelect(
                    `${currentAlias}.${relationName}`,
                    nextAlias
                );

                currentAlias = nextAlias;
            }
        }
    }
}

/**
 * 쿼리 조건을 위한 체이닝 클래스
 */
export class CrudQueryCondition<T extends ObjectLiteral = any> {
    constructor(
        private queryBuilder: CrudQueryBuilder<T>,
        private field: string,
        private value?: any
    ) {}

    /**
     * 같음 조건
     */
    equals(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, value);
    }

    /**
     * 같지 않음 조건
     */
    notEquals(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $ne: value });
    }

    /**
     * 보다 큼
     */
    gt(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $gt: value });
    }

    /**
     * 보다 크거나 같음
     */
    gte(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $gte: value });
    }

    /**
     * 보다 작음
     */
    lt(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $lt: value });
    }

    /**
     * 보다 작거나 같음
     */
    lte(value: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $lte: value });
    }

    /**
     * LIKE 조건
     */
    like(pattern: string): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $like: pattern });
    }

    /**
     * IN 조건
     */
    in(values: any[]): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $in: values });
    }

    /**
     * NOT IN 조건
     */
    notIn(values: any[]): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $not: { $in: values } });
    }

    /**
     * BETWEEN 조건
     */
    between(start: any, end: any): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $between: [start, end] });
    }

    /**
     * NULL 조건
     */
    isNull(): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, null);
    }

    /**
     * NOT NULL 조건
     */
    isNotNull(): CrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $not: null });
    }
}

/**
 * CRUD 쿼리 빌더 팩토리
 */
export class CrudQueryFactory {
    /**
     * 새로운 쿼리 빌더 생성
     */
    static create<T extends ObjectLiteral = any>(
        entity: any,
        repository: Repository<T>,
        alias?: string
    ): CrudQueryBuilder<T> {
        return new CrudQueryBuilder<T>(entity, repository, alias);
    }

    /**
     * Repository에서 직접 쿼리 빌더 생성
     */
    static fromRepository<T extends ObjectLiteral = any>(
        repository: Repository<T>,
        alias?: string
    ): CrudQueryBuilder<T> {
        const entity = repository.metadata.target;
        return new CrudQueryBuilder<T>(entity, repository, alias);
    }
}