import { Between, In, Like, ILike, MoreThan, MoreThanOrEqual, LessThan, LessThanOrEqual, Not, IsNull, Equal } from 'typeorm';

import { FilterOperator } from '../interface/query-parser.interface';

import type { FilterOperation, SortOperation, IncludeOperation, PageOperation, ParsedQuery } from '../interface/query-parser.interface';
import type { FindManyOptions, FindOptionsWhere, FindOptionsOrder, FindOptionsRelations } from 'typeorm';

export class QueryConverter<T = any> {
    convertToFindOptions(parsedQuery: ParsedQuery): FindManyOptions<T> {
        const options: FindManyOptions<T> = {};

        // Convert filters to where clause
        if (parsedQuery.filters.length > 0) {
            options.where = this.convertFiltersToWhere(parsedQuery.filters);
        }

        // Convert sorts to order clause
        if (parsedQuery.sorts.length > 0) {
            options.order = this.convertSortsToOrder(parsedQuery.sorts);
        }

        // Convert includes to relations
        if (parsedQuery.includes.length > 0) {
            options.relations = this.convertIncludesToRelations(parsedQuery.includes);
        }

        // Convert page to take/skip
        if (parsedQuery.page) {
            const pagination = this.convertPageToPagination(parsedQuery.page);
            Object.assign(options, pagination);
        }

        return options;
    }

    private convertFiltersToWhere(filters: FilterOperation[]): FindOptionsWhere<T> {
        const where: any = {};

        for (const filter of filters) {
            const fieldPath = filter.relation ? `${filter.field}.${filter.relation}` : filter.field;
            const whereCondition = this.convertFilterToCondition(filter);

            if (whereCondition !== undefined) {
                this.setNestedProperty(where, fieldPath, whereCondition);
            }
        }

        return where;
    }

    private convertFilterToCondition(filter: FilterOperation): any {
        const { operator, value } = filter;

        switch (operator) {
            case FilterOperator.EQ:
                return Equal(value);

            case FilterOperator.NE:
                return Not(Equal(value));

            case FilterOperator.GT:
                return MoreThan(value);

            case FilterOperator.GTE:
                return MoreThanOrEqual(value);

            case FilterOperator.LT:
                return LessThan(value);

            case FilterOperator.LTE:
                return LessThanOrEqual(value);

            case FilterOperator.BETWEEN:
                if (Array.isArray(value) && value.length === 2) {
                    return Between(value[0], value[1]);
                }
                return undefined;

            case FilterOperator.LIKE:
                return Like(value as string);

            case FilterOperator.ILIKE:
                return ILike(value as string);

            case FilterOperator.START:
                return Like(value as string); // value already processed to "prefix%"

            case FilterOperator.END:
                return Like(value as string); // value already processed to "%suffix"

            case FilterOperator.CONTAINS:
                return Like(value as string); // value already processed to "%content%"

            case FilterOperator.IN:
                if (Array.isArray(value)) {
                    return In(value);
                }
                return undefined;

            case FilterOperator.NOT_IN:
                if (Array.isArray(value)) {
                    return Not(In(value));
                }
                return undefined;

            case FilterOperator.NULL:
                return value === true ? IsNull() : undefined;

            case FilterOperator.NOT_NULL:
                return value === true ? Not(IsNull()) : undefined;

            case FilterOperator.PRESENT:
                // Present means not null and not empty string
                return value === true ? Not(IsNull()) : undefined;

            case FilterOperator.BLANK:
                // Blank means null or empty string
                if (value === true) {
                    return [IsNull(), Equal('')];
                }
                return undefined;

            default:
                return Equal(value);
        }
    }

    private convertSortsToOrder(sorts: SortOperation[]): FindOptionsOrder<T> {
        const order: any = {};

        for (const sort of sorts) {
            const fieldPath = sort.relation ? `${sort.field}.${sort.relation}` : sort.field;
            const direction = sort.direction.toUpperCase() as 'ASC' | 'DESC';

            this.setNestedProperty(order, fieldPath, direction);
        }

        return order;
    }

    private convertIncludesToRelations(includes: IncludeOperation[]): FindOptionsRelations<T> {
        const relations: any = {};

        for (const include of includes) {
            // Handle nested relations or simple relation
            relations[include.relation] = include.nested && include.nested.length > 0 ? this.convertNestedIncludes(include.nested) : true;
        }

        return relations;
    }

    private convertNestedIncludes(nestedIncludes: IncludeOperation[]): any {
        const nested: any = {};

        for (const include of nestedIncludes) {
            nested[include.relation] = include.nested && include.nested.length > 0 ? this.convertNestedIncludes(include.nested) : true;
        }

        return nested;
    }

    private convertPageToPagination(page: PageOperation): Partial<FindManyOptions<T>> {
        const pagination: Partial<FindManyOptions<T>> = {};

        switch (page.type) {
            case 'number':
                if (page.number && page.size > 0 && page.size > 0) {
                    pagination.skip = (page.number - 1) * page.size;
                    pagination.take = page.size;
                }
                break;

            case 'offset':
                if (page.offset !== undefined) {
                    pagination.skip = page.offset;
                }
                if (page.limit) {
                    pagination.take = page.limit;
                }
                break;

            case 'cursor':
                // Cursor pagination requires additional logic in the service layer
                // For now, just set the size
                if (page.size > 0 && page.size > 0) {
                    pagination.take = page.size;
                }
                // Note: cursor implementation would need to be handled separately
                // as it requires WHERE conditions based on the cursor value
                break;
        }

        return pagination;
    }

    private setNestedProperty(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        const lastKey = keys[keys.length - 1];

        // Handle array values for OR conditions (like BLANK operator)
        // For array values, we need to handle OR conditions
        // This might need to be restructured depending on TypeORM's handling
        current[lastKey] = value;
    }

    // Helper method to create cursor-based where conditions
    createCursorWhere(cursorValue: string, cursorField: string, direction: 'ASC' | 'DESC' = 'ASC'): FindOptionsWhere<T> {
        const where: any = {};

        where[cursorField] = direction === 'ASC' ? MoreThan(cursorValue) : LessThan(cursorValue);

        return where;
    }
}
