import { AbstractPaginationRequest } from '../abstract';
import { PaginationType } from '../interface';

import type { CursorPaginationResponse } from '../interface';

export class PaginationCursorDto extends AbstractPaginationRequest {
    type: PaginationType.CURSOR = PaginationType.CURSOR;

    nextTotal(): number {
        return this.total;
    }

    metadata<T>(take: number, _dataLength: number, total: number, nextCursor: string): CursorPaginationResponse<T>['metadata'] {
        return {
            limit: take,
            total,
            totalPages: total ? Math.ceil(total / take) : 1,
            nextCursor: this.makeQuery(total, nextCursor),
        };
    }
}
