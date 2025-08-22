/* eslint-disable @typescript-eslint/no-explicit-any */
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { CrudQueryBuilder, CrudQueryCondition } from './crud-query-builder';
import { PaginationResult, PaginationOptions } from './crud-query-helper';

// 타입 안전 유틸리티 타입들
type KeysOfType<T, U> = {
    [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

type EntityKeys<T> = keyof T;
type EntityStringKeys<T> = KeysOfType<T, string>;
type EntityNumberKeys<T> = KeysOfType<T, number>;
type EntityDateKeys<T> = KeysOfType<T, Date>;
type EntityBooleanKeys<T> = KeysOfType<T, boolean>;

/**
 * 타입 안전한 CRUD 쿼리 빌더
 */
export class TypeSafeCrudQueryBuilder<T extends ObjectLiteral = any> {
    private queryBuilder: CrudQueryBuilder<T>;

    constructor(entity: new () => T, repository: Repository<T>, alias?: string) {
        this.queryBuilder = new CrudQueryBuilder<T>(entity, repository, alias);
    }

    /**
     * 엔티티를 지정하여 쿼리 시작
     */
    from(entity: new () => T): this {
        this.queryBuilder.from(entity);
        return this;
    }

    /**
     * 타입 안전한 WHERE 조건 (함수형 접근)
     */
    where<K extends EntityKeys<T>>(
        selector: (entity: T) => T[K]
    ): TypeSafeQueryCondition<T, T[K]> {
        const fieldName = this.getFieldName(selector);
        return new TypeSafeQueryCondition<T, T[K]>(this, fieldName);
    }

    /**
     * 문자열 필드 전용 WHERE 조건
     */
    whereString<K extends EntityStringKeys<T>>(
        selector: (entity: T) => T[K]
    ): TypeSafeStringCondition<T> {
        const fieldName = this.getFieldName(selector);
        return new TypeSafeStringCondition<T>(this, fieldName);
    }

    /**
     * 숫자 필드 전용 WHERE 조건
     */
    whereNumber<K extends EntityNumberKeys<T>>(
        selector: (entity: T) => T[K]
    ): TypeSafeNumberCondition<T> {
        const fieldName = this.getFieldName(selector);
        return new TypeSafeNumberCondition<T>(this, fieldName);
    }

    /**
     * 날짜 필드 전용 WHERE 조건
     */
    whereDate<K extends EntityDateKeys<T>>(
        selector: (entity: T) => T[K]
    ): TypeSafeDateCondition<T> {
        const fieldName = this.getFieldName(selector);
        return new TypeSafeDateCondition<T>(this, fieldName);
    }

    /**
     * 타입 안전한 관계 포함
     */
    include<K extends keyof T>(
        selector: (entity: T) => T[K]
    ): this {
        const relationName = this.getFieldName(selector);
        this.queryBuilder.include(relationName);
        return this;
    }

    /**
     * 다중 관계 포함
     */
    includeMultiple<K extends keyof T>(
        selectors: Array<(entity: T) => T[K]>
    ): this {
        const relations = selectors.map(selector => this.getFieldName(selector));
        this.queryBuilder.include(relations);
        return this;
    }

    /**
     * 타입 안전한 정렬
     */
    orderBy<K extends EntityKeys<T>>(
        selector: (entity: T) => T[K],
        direction: 'ASC' | 'DESC' = 'ASC'
    ): this {
        const fieldName = this.getFieldName(selector);
        const sortField = direction === 'DESC' ? `-${fieldName}` : fieldName;
        this.queryBuilder.sort(sortField);
        return this;
    }

    /**
     * 타입 안전한 오름차순 정렬
     */
    orderByAsc<K extends EntityKeys<T>>(
        selector: (entity: T) => T[K]
    ): this {
        return this.orderBy(selector, 'ASC');
    }

    /**
     * 타입 안전한 내림차순 정렬
     */
    orderByDesc<K extends EntityKeys<T>>(
        selector: (entity: T) => T[K]
    ): this {
        return this.orderBy(selector, 'DESC');
    }

    /**
     * 페이지네이션 설정
     */
    paginate(options: PaginationOptions): this {
        this.queryBuilder.paginate(options);
        return this;
    }

    /**
     * 페이지 설정
     */
    page(page: number, limit: number = 20): this {
        this.queryBuilder.page(page, limit);
        return this;
    }

    /**
     * 쿼리 실행
     */
    async execute(): Promise<PaginationResult<T>> {
        return await this.queryBuilder.execute();
    }

    /**
     * 단일 결과 조회
     */
    async first(): Promise<T | null> {
        return await this.queryBuilder.first();
    }

    /**
     * 개수 조회
     */
    async count(): Promise<number> {
        return await this.queryBuilder.count();
    }

    /**
     * 모든 결과 조회
     */
    async getMany(): Promise<T[]> {
        return await this.queryBuilder.getMany();
    }

    /**
     * 필터 추가 (내부 사용)
     */
    addFilter(field: string, value: any): this {
        this.queryBuilder.addFilter(field, value);
        return this;
    }

    /**
     * 프로퍼티 이름 추출
     */
    private getFieldName<K extends keyof T>(selector: (entity: T) => T[K]): string {
        // 함수 문자열에서 프로퍼티 이름 추출
        const funcStr = selector.toString();
        const match = funcStr.match(/\.(\w+)/);
        if (!match) {
            throw new Error('Invalid property selector');
        }
        return match[1];
    }
}

/**
 * 타입 안전한 쿼리 조건 베이스 클래스
 */
export class TypeSafeQueryCondition<T extends ObjectLiteral, V> {
    constructor(
        protected queryBuilder: TypeSafeCrudQueryBuilder<T>,
        protected field: string
    ) {}

    /**
     * 같음 조건
     */
    equals(value: V): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, value);
    }

    /**
     * 같지 않음 조건
     */
    notEquals(value: V): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $ne: value });
    }

    /**
     * IN 조건
     */
    in(values: V[]): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $in: values });
    }

    /**
     * NOT IN 조건
     */
    notIn(values: V[]): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $not: { $in: values } });
    }

    /**
     * NULL 조건
     */
    isNull(): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, null);
    }

    /**
     * NOT NULL 조건
     */
    isNotNull(): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $not: null });
    }
}

/**
 * 문자열 전용 조건
 */
export class TypeSafeStringCondition<T extends ObjectLiteral> extends TypeSafeQueryCondition<T, string> {
    /**
     * LIKE 조건
     */
    like(pattern: string): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $like: pattern });
    }

    /**
     * 시작하는 문자열
     */
    startsWith(prefix: string): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $like: `${prefix}%` });
    }

    /**
     * 끝나는 문자열
     */
    endsWith(suffix: string): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $like: `%${suffix}` });
    }

    /**
     * 포함하는 문자열
     */
    contains(substring: string): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $like: `%${substring}%` });
    }
}

/**
 * 숫자 전용 조건
 */
export class TypeSafeNumberCondition<T extends ObjectLiteral> extends TypeSafeQueryCondition<T, number> {
    /**
     * 보다 큼
     */
    greaterThan(value: number): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $gt: value });
    }

    /**
     * 보다 크거나 같음
     */
    greaterThanOrEqual(value: number): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $gte: value });
    }

    /**
     * 보다 작음
     */
    lessThan(value: number): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $lt: value });
    }

    /**
     * 보다 작거나 같음
     */
    lessThanOrEqual(value: number): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $lte: value });
    }

    /**
     * 범위 조건
     */
    between(start: number, end: number): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $between: [start, end] });
    }
}

/**
 * 날짜 전용 조건
 */
export class TypeSafeDateCondition<T extends ObjectLiteral> extends TypeSafeQueryCondition<T, Date> {
    /**
     * 이후 날짜
     */
    after(date: Date): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $gt: date });
    }

    /**
     * 이전 날짜
     */
    before(date: Date): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $lt: date });
    }

    /**
     * 날짜 범위
     */
    between(startDate: Date, endDate: Date): TypeSafeCrudQueryBuilder<T> {
        return this.queryBuilder.addFilter(this.field, { $between: [startDate, endDate] });
    }

    /**
     * 오늘 이후
     */
    afterToday(): TypeSafeCrudQueryBuilder<T> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.after(today);
    }

    /**
     * 오늘 이전
     */
    beforeToday(): TypeSafeCrudQueryBuilder<T> {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return this.before(today);
    }
}

/**
 * 타입 안전한 쿼리 빌더 팩토리
 */
export class TypeSafeQueryFactory {
    /**
     * 새로운 타입 안전 쿼리 빌더 생성
     */
    static create<T extends ObjectLiteral>(
        entity: new () => T,
        repository: Repository<T>,
        alias?: string
    ): TypeSafeCrudQueryBuilder<T> {
        return new TypeSafeCrudQueryBuilder<T>(entity, repository, alias);
    }

    /**
     * Repository에서 직접 타입 안전 쿼리 빌더 생성
     */
    static fromRepository<T extends ObjectLiteral>(
        repository: Repository<T>,
        entityClass: new () => T,
        alias?: string
    ): TypeSafeCrudQueryBuilder<T> {
        return new TypeSafeCrudQueryBuilder<T>(entityClass, repository, alias);
    }
}