# CrudQueryHelper 사용 가이드

## 개요

`CrudQueryHelper`는 route를 오버라이드하여 커스텀 로직을 구현할 때, 페이지네이션, 필터링, 정렬 기능을 쉽게 사용할 수 있도록 도와주는 헬퍼 클래스입니다.

## 왜 필요한가?

기본 CRUD 기능은 자동으로 페이지네이션과 필터링을 처리하지만, route를 오버라이드하면 이러한 기능을 직접 구현해야 합니다. `CrudQueryHelper`를 사용하면 이러한 기능을 쉽게 구현할 수 있습니다.

## 기본 사용법

### 1. 간단한 예제

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Crud, CrudService, CrudQueryHelper } from 'nestjs-crud';

@Controller('users')
@Crud({
    entity: User,
})
export class UserController {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    // index route 오버라이드
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // 한 번에 모든 기능 적용 (페이지네이션, 필터링, 정렬)
        return CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
            allowedFilterFields: ['status', 'age', 'name'],
            defaultLimit: 20
        });
    }
}
```

### 2. 단계별 적용

```typescript
@Get()
async index(@Req() req: Request) {
    // 1. 파라미터 추출
    const pagination = CrudQueryHelper.extractPaginationParams(req);
    const filters = CrudQueryHelper.extractFilterParams(req, ['status', 'age']);
    const sort = CrudQueryHelper.extractSortParams(req);

    // 2. QueryBuilder 생성
    const qb = this.userRepository.createQueryBuilder('user');

    // 3. 필터 적용
    CrudQueryHelper.applyFiltersToQueryBuilder(qb, filters);

    // 4. 정렬 적용
    CrudQueryHelper.applySortToQueryBuilder(qb, sort);

    // 5. 페이지네이션 적용 및 결과 반환
    return CrudQueryHelper.applyPaginationToQueryBuilder(qb, pagination);
}
```

## 지원하는 쿼리 파라미터

### 페이지네이션

```bash
# 페이지 기반
GET /users?page=2&limit=20

# 오프셋 기반
GET /users?offset=40&limit=20

# 최대 제한
GET /users?limit=100&maxLimit=50  # 50으로 제한됨
```

### 필터링

#### 기본 필터
```bash
# 일치
GET /users?status=active

# 같지 않음
GET /users?status!=inactive

# NULL 체크
GET /users?deletedAt=null
GET /users?deletedAt=!null
```

#### 비교 연산자
```bash
# 보다 큼/작음
GET /users?age=>18
GET /users?age=<65

# 크거나 같음/작거나 같음
GET /users?age=>=18
GET /users?age=<=65
```

#### 문자열 검색
```bash
# LIKE 검색 (와일드카드 *)
GET /users?name=John*      # John으로 시작
GET /users?name=*Doe       # Doe로 끝남
GET /users?name=*oh*       # oh를 포함
```

#### 복수 값
```bash
# IN 연산자 (콤마로 구분)
GET /users?status=active,pending,inactive
```

#### JSON 형식 필터
```bash
# 복잡한 조건
GET /users?where={"age":{"$gte":18,"$lte":65},"status":"active"}
```

### 정렬

```bash
# 오름차순 (기본)
GET /users?sort=name

# 내림차순 (- 붙임)
GET /users?sort=-createdAt

# 명시적 오름차순 (+ 붙임)
GET /users?sort=+name

# 복수 정렬
GET /users?sort=status,-createdAt
```

## 고급 사용법

### 1. 관계(Relations) 포함

```typescript
@Get()
async index(@Req() req: Request) {
    const qb = this.userRepository.createQueryBuilder('user');
    
    // include 파라미터로 관계 포함
    const include = req.query.include as string;
    if (include) {
        const relations = include.split(',');
        relations.forEach(relation => {
            qb.leftJoinAndSelect(`user.${relation}`, relation);
        });
    }
    
    return CrudQueryHelper.applyAllToQueryBuilder(qb, req);
}
```

사용:
```bash
GET /users?include=posts,profile&page=1&limit=10
```

### 2. 커스텀 응답 포맷

```typescript
@Get()
async index(@Req() req: Request) {
    const qb = this.userRepository.createQueryBuilder('user');
    const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req);
    
    // 커스텀 포맷으로 변환
    return {
        success: true,
        data: result.data.map(user => ({
            ...user,
            displayName: `${user.name} (${user.email})`
        })),
        pagination: {
            currentPage: result.metadata.page,
            totalPages: result.metadata.totalPages,
            pageSize: result.metadata.limit,
            totalItems: result.metadata.total
        }
    };
}
```

### 3. 커스텀 필터 로직

```typescript
@Get()
async index(@Req() req: Request) {
    const params = CrudQueryHelper.extractAllParams(req);
    const qb = this.userRepository.createQueryBuilder('user');
    
    // 커스텀 로직 추가
    if (params.filters.search) {
        const search = params.filters.search;
        delete params.filters.search; // 기본 필터에서 제거
        
        // 커스텀 검색 로직
        qb.andWhere(
            '(user.name LIKE :search OR user.email LIKE :search)',
            { search: `%${search}%` }
        );
    }
    
    // 나머지 필터 적용
    CrudQueryHelper.applyFiltersToQueryBuilder(qb, params.filters);
    CrudQueryHelper.applySortToQueryBuilder(qb, params.sort);
    
    return CrudQueryHelper.applyPaginationToQueryBuilder(qb, params.pagination);
}
```

### 4. Repository 직접 사용 (간단한 경우)

```typescript
@Get('active')
async getActiveUsers(@Req() req: Request) {
    const pagination = CrudQueryHelper.extractPaginationParams(req);
    
    return CrudQueryHelper.paginate(
        this.userRepository,
        {
            where: { status: 'active' },
            order: { createdAt: 'DESC' }
        },
        pagination
    );
}
```

## API 레퍼런스

### 주요 메서드

#### `extractPaginationParams(req, defaultLimit?)`
Request에서 페이지네이션 파라미터를 추출합니다.

#### `extractFilterParams(req, allowedFields?)`
Request에서 필터 파라미터를 추출합니다.

#### `extractSortParams(req)`
Request에서 정렬 파라미터를 추출합니다.

#### `applyAllToQueryBuilder(qb, req, options?)`
QueryBuilder에 모든 파라미터를 한번에 적용합니다.

#### `paginate(repository, options, pagination)`
Repository를 사용한 간단한 페이지네이션을 수행합니다.

### 반환 타입

```typescript
interface PaginationResult<T> {
    data: T[];
    metadata: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}
```

## 실제 사용 예제

### 복잡한 비즈니스 로직과 함께 사용

```typescript
@Get()
async index(@Req() req: Request) {
    const qb = this.userRepository.createQueryBuilder('user');
    
    // 1. 권한 체크 (예: 관리자만 삭제된 사용자 볼 수 있음)
    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin) {
        qb.where('user.deletedAt IS NULL');
    }
    
    // 2. 조직별 필터링
    if (req.user?.organizationId) {
        qb.andWhere('user.organizationId = :orgId', { 
            orgId: req.user.organizationId 
        });
    }
    
    // 3. CrudQueryHelper로 나머지 처리
    const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
        allowedFilterFields: ['status', 'role', 'department'],
        defaultLimit: 25
    });
    
    // 4. 민감한 정보 제거
    result.data = result.data.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
    });
    
    return result;
}
```

## 마이그레이션 가이드

기존 오버라이드된 route를 CrudQueryHelper로 마이그레이션:

### Before
```typescript
@Get()
async index(@Query() query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const qb = this.userRepository.createQueryBuilder('user');
    
    if (query.status) {
        qb.where('user.status = :status', { status: query.status });
    }
    
    if (query.sort) {
        const order = query.sort.startsWith('-') ? 'DESC' : 'ASC';
        const field = query.sort.replace(/^-/, '');
        qb.orderBy(`user.${field}`, order);
    }
    
    const [data, total] = await qb
        .skip(offset)
        .take(limit)
        .getManyAndCount();
    
    return {
        data,
        total,
        page,
        limit
    };
}
```

### After
```typescript
@Get()
async index(@Req() req: Request) {
    const qb = this.userRepository.createQueryBuilder('user');
    return CrudQueryHelper.applyAllToQueryBuilder(qb, req);
}
```

## 주의사항

1. **필드 검증**: `allowedFilterFields`를 사용하여 허용된 필드만 필터링하도록 제한하세요.
2. **SQL Injection**: CrudQueryHelper는 파라미터 바인딩을 사용하여 SQL Injection을 방지합니다.
3. **성능**: 대량 데이터 조회 시 인덱스가 있는 필드로 필터링/정렬하세요.
4. **타입 안정성**: TypeScript의 타입 시스템을 활용하여 엔티티 타입을 명시하세요.

## 문제 해결

### 필터가 적용되지 않음
- `allowedFilterFields`에 필드가 포함되어 있는지 확인
- 필드명이 엔티티의 실제 컬럼명과 일치하는지 확인

### 정렬이 작동하지 않음
- 정렬 필드가 엔티티에 존재하는지 확인
- QueryBuilder의 alias가 올바른지 확인

### 페이지네이션 메타데이터가 잘못됨
- `getCount()`가 필터 적용 후 호출되는지 확인
- 중복 제거(DISTINCT) 사용 시 카운트가 정확한지 확인