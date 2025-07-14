export interface CrudResponse<T> {
  data: T;
  metadata?: CrudResponseMetadata;
}

export interface CrudArrayResponse<T> {
  data: T[];
  metadata?: CrudResponseMetadata;
}

export interface CrudResponseMetadata {
  operation: 'create' | 'show' | 'update' | 'destroy' | 'upsert' | 'recover';
  timestamp: string;
  affectedCount?: number;
  isNew?: boolean; // for upsert operations
  wasSoftDeleted?: boolean; // for recover operations
  includedRelations?: string[];
  excludedFields?: string[];
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