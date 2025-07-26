/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CrudResponse<T> {
  data: T;
  metadata?: CrudResponseMetadata;
}

export interface CrudArrayResponse<T> {
  data: T[];
  metadata?: CrudResponseMetadata;
}

export interface CrudResponseMetadata {
  operation: 'create' | 'show' | 'update' | 'destroy' | 'upsert' | 'recover' | 'index';
  timestamp: string;
  affectedCount?: number;
  isNew?: boolean; // for upsert operations
  wasSoftDeleted?: boolean; // for recover operations
  includedRelations?: string[];
  excludedFields?: string[];
  pagination?: PaginationMetadata; // for index operations
}

export interface PaginationMetadata {
  type: 'offset' | 'cursor';
  total: number;
  limit?: number;
  offset?: number;
  page?: number;
  pages?: number;
  totalPages?: number;
  nextCursor?: string;
}

export type CrudMethodResponse<T> = CrudResponse<T> | CrudArrayResponse<T>;

// Helper function to create standardized responses
export function createCrudResponse<T>(
  data: T,
  operation: CrudResponseMetadata['operation'],
  options?: Partial<CrudResponseMetadata>
): CrudResponse<T> {
  return {
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      affectedCount: Array.isArray(data) ? data.length : 1,
      ...options,
    },
  };
}

export function createCrudArrayResponse<T>(
  data: T[],
  operation: CrudResponseMetadata['operation'],
  options?: Partial<CrudResponseMetadata>
): CrudArrayResponse<T> {
  return {
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      affectedCount: data.length,
      ...options,
    },
  };
}

// Helper function to create paginated responses
export function createPaginatedResponse<T>(
  data: T[],
  paginationType: 'offset' | 'cursor',
  paginationInfo: {
    total: number;
    limit?: number;
    offset?: number;
    page?: number;
    pages?: number;
    totalPages?: number;
    nextCursor?: string;
  },
  options?: Partial<Omit<CrudResponseMetadata, 'operation' | 'pagination'>>
): CrudArrayResponse<T> {
  return {
    data,
    metadata: {
      operation: 'index',
      timestamp: new Date().toISOString(),
      affectedCount: data.length,
      pagination: {
        type: paginationType,
        ...paginationInfo,
      },
      ...options,
    },
  };
}

// Convert existing PaginationResponse to CrudArrayResponse
export function convertPaginationToCrudResponse<T>(
  paginationResponse: { data: T[]; metadata: any } // PaginationResponse<T> but avoiding circular dependency
): CrudArrayResponse<T> {
  const { data, metadata } = paginationResponse;

  // Determine pagination type based on metadata structure
  const paginationType: 'offset' | 'cursor' = 'page' in metadata ? 'offset' : 'cursor';

  const paginationInfo: any = {
    total: metadata.total,
  };

  if (paginationType === 'offset') {
    paginationInfo.page = metadata.page;
    paginationInfo.pages = metadata.pages;
    paginationInfo.offset = metadata.offset;
    paginationInfo.nextCursor = metadata.nextCursor;
  } else {
    paginationInfo.limit = metadata.limit;
    paginationInfo.totalPages = metadata.totalPages;
    paginationInfo.nextCursor = metadata.nextCursor;
  }

  return createPaginatedResponse(data, paginationType, paginationInfo);
} 