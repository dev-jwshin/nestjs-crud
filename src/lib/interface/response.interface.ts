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

// Overloaded crudResponse function signatures
export function crudResponse<T>(
  data: T[],
  options?: {
    paginationType?: 'offset' | 'cursor';
    limit?: number;
    page?: number;
    excludedFields?: string[];
    includedRelations?: string[];
  }
): CrudArrayResponse<T>;

export function crudResponse<T>(
  data: T,
  options?: {
    excludedFields?: string[];
    includedRelations?: string[];
  }
): CrudResponse<T>;

// Implementation
export function crudResponse<T>(
  data: T | T[],
  options?: {
    paginationType?: 'offset' | 'cursor';
    limit?: number;
    page?: number;
    excludedFields?: string[];
    includedRelations?: string[];
  }
): CrudResponse<T> | CrudArrayResponse<T> {
  const {
    paginationType = 'offset',
    limit = 20,
    page = 1,
    excludedFields,
    includedRelations,
  } = options || {};

  const baseMetadata = {
    timestamp: new Date().toISOString(),
    ...(excludedFields && { excludedFields }),
    ...(includedRelations && { includedRelations }),
  };

  // Handle array data (with pagination)
  if (Array.isArray(data)) {
    const total = data.length;
    const pages = Math.ceil(total / limit);

    // Create base64 encoded cursor for consistency
    const nextCursor = Buffer.from(JSON.stringify({
      nextCursor: Buffer.from(`${total}`).toString('base64'),
      total
    })).toString('base64');

    const paginationInfo: PaginationMetadata = {
      type: paginationType,
      total,
      page,
      pages,
      offset: total, // All data is shown, so offset equals total
      nextCursor,
    };

    if (paginationType === 'cursor') {
      paginationInfo.limit = limit;
      paginationInfo.totalPages = pages;
    }

    return {
      data,
      metadata: {
        ...baseMetadata,
        affectedCount: total,
        pagination: paginationInfo,
      },
    } as CrudArrayResponse<T>;
  }

  // Handle single object data (without pagination)
  return {
    data,
    metadata: {
      ...baseMetadata,
      affectedCount: 1,
    },
  } as CrudResponse<T>;
}

// Helper function to create standardized responses
export function createCrudResponse<T>(
  data: T,
  options?: Partial<CrudResponseMetadata>
): CrudResponse<T> {
  return {
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      affectedCount: Array.isArray(data) ? data.length : 1,
      ...options,
    },
  };
}

export function createCrudArrayResponse<T>(
  data: T[],
  options?: Partial<CrudResponseMetadata>
): CrudArrayResponse<T> {
  return {
    data,
    metadata: {
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
  options?: Partial<Omit<CrudResponseMetadata, 'pagination'>>
): CrudArrayResponse<T> {
  return {
    data,
    metadata: {
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