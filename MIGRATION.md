# Migration Guide

## Upgrading to v0.2.0

### Major Features
Version 0.2.0 introduces **Bulk Operations Support** for UPDATE, UPSERT, DELETE, and RECOVER methods, complementing the existing bulk CREATE support.

### Breaking Changes
None - v0.2.0 maintains full backward compatibility with existing single-operation APIs.

### New Features

#### 1. Bulk Update Operations
```typescript
// Before v0.2.0 - Multiple requests needed
await fetch('/users/1', { method: 'PUT', body: { status: 'active' } });
await fetch('/users/2', { method: 'PUT', body: { status: 'active' } });

// After v0.2.0 - Single bulk request
await fetch('/users', { 
  method: 'PUT',
  body: [
    { id: 1, status: 'active' },
    { id: 2, status: 'active' }
  ]
});
```

#### 2. Bulk Upsert Operations
```typescript
// After v0.2.0
await fetch('/users/upsert', {
  method: 'POST',
  body: [
    { id: 1, name: 'Updated User' },  // Updates existing
    { name: 'New User', email: 'new@example.com' }  // Creates new
  ]
});
```

#### 3. Bulk Delete Operations
```typescript
// After v0.2.0 - Two ways to bulk delete
// Option 1: Body with IDs
await fetch('/users', {
  method: 'DELETE',
  body: { ids: [1, 2, 3] }
});

// Option 2: Query parameters
await fetch('/users?ids=1,2,3', {
  method: 'DELETE'
});
```

#### 4. Bulk Recover Operations (Soft Delete)
```typescript
// After v0.2.0
await fetch('/users/recover', {
  method: 'POST',
  body: { ids: [1, 2, 3] }
});
```

### Response Format for Bulk Operations

All bulk operations return a consistent response format:

```typescript
{
  data: T[],  // Array of affected entities
  metadata: {
    affectedCount: number,
    wasSoftDeleted?: boolean,
    upsertInfo?: Array<{ isNew: boolean }>  // For upsert operations
  }
}
```

### Lifecycle Hooks with Bulk Operations

Lifecycle hooks are executed for **each item** in bulk operations:

```typescript
@Crud({
  entity: User,
  routes: {
    update: {
      hooks: {
        assignBefore: async (entity, context) => {
          // Called for EACH entity in bulk update
          entity.updatedAt = new Date();
          return entity;
        }
      }
    }
  }
})
```

### Validation in Bulk Operations

- **Bulk Update**: Each item must include the primary key (typically `id`)
- **Bulk Upsert**: Items with primary key are updated, without are created
- **Bulk Delete**: Accepts either `body.ids` array or `query.ids` parameter
- **Bulk Recover**: Requires array of IDs to recover

### Performance Considerations

1. **Database Transactions**: Bulk operations are executed within transactions when possible
2. **Memory Usage**: Large bulk operations (>1000 items) should be batched
3. **Response Size**: Consider pagination for bulk read operations

### Migration Steps

1. **Update Package**
   ```bash
   npm install @foryourdev/nestjs-crud@^0.2.0
   # or
   yarn add @foryourdev/nestjs-crud@^0.2.0
   ```

2. **No Code Changes Required**
   - Existing single operations continue to work as before
   - Bulk operations are opt-in via array payloads

3. **Optional: Update Client Code**
   - Identify loops performing multiple CRUD operations
   - Replace with single bulk operation for better performance

### Example Migration

#### Before (v0.1.x)
```typescript
// Client code with multiple requests
async function updateUserStatuses(userIds: number[], status: string) {
  const promises = userIds.map(id => 
    fetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
      headers: { 'Content-Type': 'application/json' }
    })
  );
  return Promise.all(promises);
}
```

#### After (v0.2.0)
```typescript
// Client code with single bulk request
async function updateUserStatuses(userIds: number[], status: string) {
  return fetch('/api/users', {
    method: 'PUT',
    body: JSON.stringify(
      userIds.map(id => ({ id, status }))
    ),
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Testing Your Migration

1. **Test Existing Operations**: Verify all existing single operations still work
2. **Test New Bulk Operations**: Gradually introduce bulk operations
3. **Monitor Performance**: Compare response times and resource usage
4. **Validate Hooks**: Ensure lifecycle hooks execute correctly for bulk operations

### Troubleshooting

#### Issue: "Each item must include the primary key"
**Solution**: Ensure all items in bulk update include the `id` field

#### Issue: Validation errors in bulk operations
**Solution**: All items must pass validation - fix invalid items or process separately

#### Issue: Database constraint violations
**Solution**: Bulk operations respect database constraints - ensure unique fields remain unique

### Support

For issues or questions about migration:
- GitHub Issues: https://github.com/dev-jwshin/nestjs-crud/issues
- Documentation: See README.md for detailed bulk operations examples

### Next Steps

After successful migration to v0.2.0:
1. Review your codebase for optimization opportunities using bulk operations
2. Update your API documentation to include bulk endpoints
3. Consider implementing rate limiting for bulk operations
4. Monitor database performance with large bulk operations