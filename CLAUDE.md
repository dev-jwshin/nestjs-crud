# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the `@foryourdev/nestjs-crud` library - a powerful package for automatically generating RESTful CRUD APIs based on NestJS and TypeORM. The library provides decorators and utilities to eliminate boilerplate code while maintaining flexibility for customization.

## Build and Development Commands

### Core Development Commands
```bash
# Install dependencies
npm install

# Build the library (dual CJS/ESM format)
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Code formatting
npm run format         # Format all TypeScript/JSON/JS files
npm run format-check   # Check formatting without changes
```

### Testing Commands
```bash
# Run all tests
npm test

# Run a specific test file
npm test -- [filename].test.ts

# Run tests with CI environment (includes Docker setup)
npm run test:ci

# Docker compose for test databases
npm run docker-compose-up:test    # Start test databases
npm run docker-compose-down:test  # Stop test databases
```

### Release and Publishing
```bash
npm run release  # Interactive release process with release-it
```

## Architecture Overview

### Core Decorator System

The library revolves around the `@Crud` decorator that automatically generates 11 REST endpoints from a TypeORM entity:

1. **Route Generation Flow**:
   - `crud.decorator.ts` → Processes decorator options
   - `crud.route.factory.ts` → Dynamically creates controller methods
   - `crud.service.ts` → Implements actual CRUD operations
   - `interceptor/*.ts` → Handles request validation and transformation

2. **Request Processing Pipeline**:
   ```
   HTTP Request → Interceptor → Validation → Service → Hooks → Response
   ```
   - Interceptors parse query parameters and validate request bodies
   - Dynamic DTOs are generated from entity metadata
   - Lifecycle hooks execute at specific stages
   - Responses are standardized via `crudResponse`

### Key Architectural Components

#### 1. Query System
The library implements a sophisticated query system that supports:
- **Filtering**: 30+ operators parsed by `QueryParser` and converted to TypeORM queries by `QueryConverter`
- **Pagination**: Three types (Offset, Cursor, Page) handled by `PaginationHelper`
- **Relations**: Deep relation loading with circular reference protection
- **Sorting**: Multi-field sorting with direction control

#### 2. Validation and Security
- **Dynamic DTO Generation**: `DynamicValidationGenerator` creates DTOs from entity metadata
- **Field Filtering**: `allowedParams`, `allowedFilters`, `allowedIncludes` control access
- **Metadata Caching**: `MetadataCacheManager` optimizes repeated operations

#### 3. Lifecycle Hook System
Two approaches for executing custom logic:
- **Decorator-based** (Recommended): `@BeforeCreate`, `@AfterUpdate`, etc. in `lifecycle-hooks.decorator.ts`
- **Configuration-based**: Legacy `routes.hooks` configuration

#### 4. Performance Optimizations
- **Transform Optimization**: `skipTransform` option prevents redundant transformations (98.9% improvement)
- **Batch Processing**: `BatchProcessor` optimizes bulk operations using `In` operator
- **Response Caching**: `ResponseFactory` uses WeakMap for transformation caching

### Helper Classes for Custom Routes

When overriding default CRUD routes, two helper classes maintain CRUD functionality:

1. **CrudQueryHelper** (`crud-query-helper.ts`):
   - Extracts and applies filters, sorting, pagination from request
   - Integrates with TypeORM QueryBuilder

2. **CrudOperationHelper** (`crud-operation-helper.ts`):
   - Provides validation, hooks, and field filtering
   - Offers optimized `*WithResponse` methods that include response formatting

### Critical Files to Understand

1. **`crud.decorator.ts`**: Entry point, understands how options flow through the system
2. **`crud.route.factory.ts`**: Dynamic route generation logic
3. **`crud.service.ts`**: Core CRUD operations implementation
4. **`provider/query-parser.ts`**: Query parameter parsing logic
5. **`interface/response.interface.ts`**: Response formatting with `crudResponse`

## Testing Approach

- Tests require Docker containers for MySQL, PostgreSQL, and MongoDB
- Coverage thresholds: 60% for all metrics
- Test files use `.test.ts` extension
- Integration tests validate full request/response cycle
- Performance tests verify optimization improvements

## Performance Considerations

1. **Bulk Operations**: Use `In` operator for batch queries (100 queries → 1 query)
2. **Transform Optimization**: Use `skipTransform: true` for pre-transformed data
3. **Relation Loading**: Be cautious with deep relations to avoid N+1 queries
4. **Batch Sizes**: Optimal batch size calculation in `BatchProcessor`

## Common Patterns

### Adding New Features
1. Update interfaces in `interface/` directory
2. Modify `crud.service.ts` for new operations
3. Add interceptor if request processing needed
4. Update `crud.route.factory.ts` for new routes
5. Add tests covering the new functionality

### Debugging Request Flow
1. Check interceptor execution in `interceptor/` files
2. Verify query parsing in `QueryParser`
3. Examine hook execution timing
4. Use `logging: true` in `@Crud` decorator for SQL queries