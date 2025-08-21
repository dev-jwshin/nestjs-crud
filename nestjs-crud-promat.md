# NestJS CRUD 프로젝트 프롬프팅 가이드

## 프로젝트 개요

당신은 `@foryourdev/nestjs-crud` 패키지를 다루고 있습니다. 이는 NestJS와 TypeORM 기반으로 RESTful CRUD API를 자동 생성하는 강력한 라이브러리입니다.

### 핵심 정보

-   **패키지명**: @foryourdev/nestjs-crud
-   **버전**: 0.2.1
-   **라이선스**: MIT
-   **GitHub**: https://github.com/dev-jwshin/nestjs-crud
-   **NPM**: https://www.npmjs.com/package/@foryourdev/nestjs-crud

## 주요 기능

### 1. 자동 CRUD 생성

```typescript
@Crud({
    entity: User,
    logging: false,
    allowedParams: ['name', 'email'],
    exclude: ['password']
})
```

이 데코레이터 하나로 11개의 REST 엔드포인트가 자동 생성됩니다.

### 2. 고급 쿼리 기능

-   **필터링**: 18개 연산자 지원
    -   형식: `?filter[column_operator]=value`
    -   예시: `?filter[age_gt]=18`, `?filter[name_like]=John`
    -   연산자: `_eq`, `_ne`, `_gt`, `_gte`, `_lt`, `_lte`, `_like`, `_ilike`, `_in`, `_not_in`, `_between`, `_start`, `_end`, `_contains`, `_null`, `_not_null`, `_present`, `_blank`
-   **페이지네이션**: Offset, Cursor, Page 기반
    -   Offset: `?page[offset]=10&page[limit]=20`
    -   Cursor: `?page[cursor]=eyJpZCI6MTB9&page[limit]=20`
    -   Page: `?page[number]=2&page[size]=20`
-   **정렬**: 다중 필드 정렬 지원
    -   형식: `?sort=field1,-field2` (- 는 내림차순)
    -   예시: `?sort=-created_at,name`
-   **관계 로딩**: 중첩된 관계 포함 지원
    -   형식: `?include=relation1,relation2`
    -   예시: `?include=posts,posts.comments`

### 3. 생명주기 훅

#### 데코레이터 방식 (권장)

```typescript
@BeforeCreate()
async hashPassword(entity: User) {
    entity.password = await bcrypt.hash(entity.password, 10);
}

@AfterUpdate()
async logUpdate(entity: User) {
    await this.auditService.log('UPDATE', entity);
}
```

#### 설정 방식 (레거시)

```typescript
routes: {
    create: {
        hooks: {
            saveBefore: async (entity) => { ... }
        }
    }
}
```

### 4. 소프트 삭제 & 복구

```typescript
routes: {
    delete: { softDelete: true },
    recover: { enabled: true }
}
```

### 5. 헬퍼 클래스

#### CrudQueryHelper

라우트를 오버라이드해도 CRUD의 쿼리 기능 사용 가능:

```typescript
const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req);
```

#### CrudOperationHelper

라우트를 오버라이드해도 CRUD의 validation과 hooks 사용 가능:

```typescript
const entity = await this.crudHelper.create(data, {
    validate: true,
    allowedParams: ['name', 'email'],
    hooks: { ... }
});
```

## 프로젝트 구조

```
src/lib/
├── crud.decorator.ts       # @Crud 데코레이터
├── crud.service.ts        # 핵심 CRUD 서비스
├── crud.route.factory.ts  # 라우트 생성 팩토리
├── dto/                   # 생명주기 훅 데코레이터
├── interceptor/           # 요청 인터셉터
├── provider/              # 쿼리 파서, 컨버터
└── utils/                 # 헬퍼 클래스
    ├── crud-query-helper.ts
    ├── crud-operation-helper.ts
    ├── response-factory.ts
    └── batch-processor.ts
```

## 최근 개선사항

### 성능 최적화

-   **N+1 쿼리 문제 해결**: `In` 연산자를 사용한 배치 쿼리
-   **응답 캐싱**: WeakMap 기반 변환 캐싱
-   **배치 처리**: 대량 데이터 최적 배치 크기 계산

### 성능 지표

-   벌크 업데이트 (100개): ~500ms → ~50ms (90% 개선)
-   벌크 삭제 (100개): ~450ms → ~40ms (91% 개선)
-   쿼리 감소: 100개 → 1개 (99% 감소)

## 코드 작성 시 주의사항

### 1. TypeORM 관계 설정

```typescript
@Entity()
class User {
    @OneToMany(() => Post, (post) => post.user)
    posts: Post[];
}
```

### 2. Validation 데코레이터

```typescript
@IsString()
@MinLength(2)
@MaxLength(100)
name: string;
```

### 3. 보안 설정

```typescript
@Crud({
    allowedParams: ['name', 'email'],  // CREATE/UPDATE 허용 필드
    exclude: ['password'],              // 응답에서 제외
    allowedFilters: ['status', 'age'], // 필터링 허용 필드
    allowedIncludes: ['posts']         // 포함 가능한 관계
})
```

### 4. 벌크 연산 처리

```typescript
// 효율적인 벌크 처리
const entities = await this.repository.find({
    where: { id: In(ids) },
});
const entityMap = new Map(entities.map((e) => [e.id, e]));
```

## 일반적인 사용 패턴

### 1. 기본 CRUD 컨트롤러

```typescript
@Controller('users')
@Crud({ entity: User })
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

### 2. 라우트 오버라이드

```typescript
@Get()
async index(@Req() req: Request) {
    // CrudQueryHelper 사용
    const qb = this.repository.createQueryBuilder('user');
    return CrudQueryHelper.applyAllToQueryBuilder(qb, req);
}
```

### 3. 커스텀 비즈니스 로직

```typescript
@BeforeCreate()
async beforeCreate(entity: User) {
    entity.createdAt = new Date();
    entity.status = 'pending';
}
```
