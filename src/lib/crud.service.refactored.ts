/**
 * Refactored method names for CrudService
 * This file contains the new naming convention for internal CRUD methods.
 * 
 * Migration Guide:
 * 
 * Old Name (deprecated)     -> New Name (recommended)
 * ------------------------     ------------------------
 * reservedIndex            -> handleIndex
 * reservedShow             -> handleShow  
 * reservedCreate           -> handleCreate
 * reservedUpsert           -> handleUpsert
 * reservedUpdate           -> handleUpdate
 * reservedDestroy          -> handleDestroy
 * reservedRecover          -> handleRecover
 * 
 * The old names are maintained as aliases for backward compatibility
 * and will be removed in v1.0.0
 * 
 * These methods are internal to the framework and should not be called directly
 * by user code. They are invoked automatically by the generated controller methods.
 */

export const REFACTORED_METHOD_NAMES = {
    reservedIndex: 'handleIndex',
    reservedShow: 'handleShow',
    reservedCreate: 'handleCreate',
    reservedUpsert: 'handleUpsert', 
    reservedUpdate: 'handleUpdate',
    reservedDestroy: 'handleDestroy',
    reservedRecover: 'handleRecover'
} as const;

export type RefactoredMethodNames = typeof REFACTORED_METHOD_NAMES[keyof typeof REFACTORED_METHOD_NAMES];