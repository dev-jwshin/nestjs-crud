# nestjs-crud

[![npm version](https://badge.fury.io/js/nestjs-crud.svg)](https://badge.fury.io/js/nestjs-crud)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

NestJS와 TypeORM을 기반으로 RESTful CRUD API를 자동으로 생성하는 강력한 라이브러리입니다.

## 📋 목차

- [특징](#특징)
- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [기본 CRUD 작업](#기본-crud-작업)
- [RESTful 쿼리 파라미터](#restful-쿼리-파라미터)
- [고급 설정](#고급-설정)
  - [보안 제어 설정](#보안-제어-설정)
  - [생명주기 훅](#생명주기-훅-lifecycle-hooks)
- [API 문서](#api-문서)
- [예제](#예제)
- [라이선스](#라이선스)

## ✨ 특징

### 🚀 핵심 기능
- **자동 CRUD 라우트 생성**: TypeORM 엔티티 기반 자동 API 생성
- **RESTful 표준 준수**: 업계 표준을 따르는 API 엔드포인트
- **Swagger 자동 생성**: API 문서 자동 생성 및 유지보수
- **강력한 유효성 검사**: class-validator를 통한 데이터 검증
- **TypeScript 완전 지원**: 타입 안전성과 IntelliSense 지원

### 🔍 고급 쿼리 기능
- **필터링**: 30가지 이상의 필터 연산자 지원
- **정렬**: 다중 필드 정렬 지원
- **관계 포함**: 중첩 관계까지 지원하는 관계 데이터 로드
- **페이지네이션**: Offset, Cursor, Number 방식 지원
- **검색**: 복잡한 검색 조건 지원

### 🛠 데이터베이스 기능
- **소프트 삭제**: 데이터를 실제 삭제하지 않고 마킹
- **복구**: 소프트 삭제된 데이터 복구
- **Upsert**: 존재하면 업데이트, 없으면 생성
- **생명주기 훅**: CRUD 작업의 각 단계에서 커스텀 로직 실행

### 🔒 보안 및 제어 기능
- **필터링 제한**: allowedFilters로 허용된 컬럼만 필터링 가능
- **파라미터 제한**: allowedParams로 허용된 컬럼만 요청 파라미터로 사용 가능
- **관계 포함 제한**: allowedIncludes로 허용된 관계만 include 가능
- **기본 차단 정책**: 미설정 시 모든 필터링/파라미터/관계 포함 차단

## 📦 설치

```bash
npm install nestjs-crud
# 또는
yarn add nestjs-crud
```

### 필수 의존성

```bash
npm install @nestjs/common @nestjs/core typeorm class-validator class-transformer
```

## 🚀 빠른 시작

### 1. 엔티티 생성

```typescript
// user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsString, IsEmail, IsOptional } from 'class-validator';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @IsString()
  name: string;

  @Column({ unique: true })
  @IsEmail()
  email: string;

  @Column({ nullable: true })
  @IsOptional()
  @IsString()
  bio?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
```

### 2. 서비스 생성

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrudService } from 'nestjs-crud';
import { User } from './user.entity';

@Injectable()
export class UserService extends CrudService<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }
}
```

### 3. 컨트롤러 생성

```typescript
// user.controller.ts
import { Controller } from '@nestjs/common';
import { Crud } from 'nestjs-crud';
import { UserService } from './user.service';
import { User } from './user.entity';

@Controller('users')
@Crud({
  entity: User,
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

### 4. 모듈 설정

```typescript
// user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

## 🎯 기본 CRUD 작업

위 설정으로 다음 API 엔드포인트가 자동 생성됩니다:

| HTTP 메서드 | 엔드포인트 | 설명 | 메서드명 |
|-------------|------------|------|----------|
| **GET** | `/users` | 사용자 목록 조회 | `index` |
| **GET** | `/users/:id` | 특정 사용자 조회 | `show` |
| **POST** | `/users` | 새 사용자 생성 | `create` |
| **PUT** | `/users/:id` | 사용자 정보 수정 | `update` |
| **DELETE** | `/users/:id` | 사용자 삭제 | `destroy` |
| **POST** | `/users/upsert` | 사용자 생성 또는 수정 | `upsert` |

| **POST** | `/users/:id/recover` | 삭제된 사용자 복구 | `recover` |

### 📊 통일된 응답 구조

모든 CRUD 작업은 메타데이터를 포함한 일관된 응답 구조를 제공합니다:

#### GET /users (index) - 페이지네이션 응답
```json
{
  "data": [
    { "id": 1, "name": "홍길동", "email": "hong@example.com" },
    { "id": 2, "name": "김철수", "email": "kim@example.com" },
    { "id": 3, "name": "박영희", "email": "park@example.com" }
  ],
  "metadata": {
    "operation": "index",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 3,
    "includedRelations": ["department", "posts"],
    "pagination": {
      "type": "offset",
      "total": 150,
      "page": 1,
      "pages": 15,
      "offset": 10,
      "nextCursor": "eyJpZCI6M30="
    }
  }
}
```

#### GET /users (cursor pagination)
```json
{
  "data": [
    { "id": 4, "name": "이민수", "email": "lee@example.com" },
    { "id": 5, "name": "최유진", "email": "choi@example.com" }
  ],
  "metadata": {
    "operation": "index",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 2,
    "pagination": {
      "type": "cursor",
      "total": 150,
      "limit": 2,
      "totalPages": 75,
      "nextCursor": "eyJpZCI6NX0="
    }
  }
}
```

#### GET /users/:id (show)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동",
    "email": "hong@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "metadata": {
    "operation": "show",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 1,
    "includedRelations": ["department"],
    "excludedFields": ["password"]
  }
}
```

#### POST /users (create)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동",
    "email": "hong@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "metadata": {
    "operation": "create",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "affectedCount": 1
  }
}
```

#### PUT /users/:id (update)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동_수정",
    "email": "hong_updated@example.com",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "metadata": {
    "operation": "update",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 1
  }
}
```

#### POST /users/upsert (upsert)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동_upsert",
    "email": "hong_upsert@example.com"
  },
  "metadata": {
    "operation": "upsert",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 1,
    "isNew": false  // true: 새로 생성, false: 기존 데이터 수정
  }
}
```

#### DELETE /users/:id (destroy)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동",
    "email": "hong@example.com",
    "deletedAt": "2024-01-15T11:00:00.000Z"
  },
  "metadata": {
    "operation": "destroy",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 1,
    "wasSoftDeleted": true  // true: 소프트 삭제, false: 하드 삭제
  }
}
```

#### POST /users/:id/recover (recover)
```json
{
  "data": {
    "id": 1,
    "name": "홍길동",
    "email": "hong@example.com",
    "deletedAt": null
  },
  "metadata": {
    "operation": "recover",
    "timestamp": "2024-01-15T11:00:00.000Z",
    "affectedCount": 1,
    "wasSoftDeleted": true  // 복구 전 소프트 삭제 상태였는지
  }
}
```

#### 다중 생성 (POST /users - 배열 전송)
```json
{
  "data": [
    { "id": 1, "name": "홍길동", "email": "hong@example.com" },
    { "id": 2, "name": "김철수", "email": "kim@example.com" }
  ],
  "metadata": {
    "operation": "create",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "affectedCount": 2
  }
}
```

## 🔍 RESTful 쿼리 파라미터

### 📋 필터링 (Filtering)

#### 기본 비교 연산자

```bash
# 같음
GET /users?filter[name_eq]=홍길동
GET /users?filter[age_eq]=25

# 다름
GET /users?filter[status_ne]=inactive
GET /users?filter[role_ne]=admin
```

#### 크기 비교 연산자

```bash
# 초과/이상
GET /users?filter[age_gt]=18
GET /users?filter[age_gte]=18

# 미만/이하
GET /users?filter[age_lt]=65
GET /users?filter[age_lte]=65

# 범위
GET /users?filter[age_between]=18,65
GET /users?filter[salary_between]=30000,80000
```

#### 문자열 패턴 연산자

```bash
# LIKE 패턴 (대소문자 구분)
GET /users?filter[name_like]=%김%
GET /users?filter[email_like]=%@gmail.com

# ILIKE 패턴 (대소문자 무시)
GET /users?filter[name_ilike]=%KIM%
GET /users?filter[email_ilike]=%GMAIL%

# 시작/끝 패턴
GET /users?filter[name_start]=김
GET /users?filter[email_end]=.com

# 포함
GET /users?filter[bio_contains]=개발자
```

#### 배열/리스트 연산자

```bash
# 포함 (IN)
GET /users?filter[id_in]=1,2,3,4,5
GET /users?filter[role_in]=admin,manager,user

# 미포함 (NOT IN)
GET /users?filter[status_not_in]=deleted,banned
GET /users?filter[role_not_in]=guest
```

#### NULL/존재 체크 연산자

```bash
# NULL 체크
GET /users?filter[deleted_at_null]=true
GET /users?filter[last_login_null]=true

# NOT NULL 체크
GET /users?filter[avatar_not_null]=true
GET /users?filter[email_verified_at_not_null]=true

# 존재 체크 (null이 아니고 빈 문자열도 아님)
GET /users?filter[bio_present]=true

# 공백 체크 (null이거나 빈 문자열)
GET /users?filter[middle_name_blank]=true
```

#### 관계 필터링

```bash
# 중첩 관계 필터링
GET /posts?filter[author.name_like]=%김%
GET /posts?filter[author.department.name_eq]=개발팀
GET /comments?filter[post.author.role_eq]=admin
```

### 🔄 정렬 (Sorting)

```bash
# 단일 필드 정렬
GET /users?sort=name                    # 이름 오름차순
GET /users?sort=-created_at             # 생성일 내림차순

# 다중 필드 정렬
GET /users?sort=role,name,-created_at   # 역할>이름>생성일순

# 관계 필드 정렬
GET /posts?sort=author.name,-created_at
GET /users?sort=department.name,name
```

### 🔗 관계 포함 (Including Relations)

**⚠️ 중요한 변경사항**: 
- `routes.relations` 옵션은 deprecated되었습니다. 
- 이제 `allowedIncludes` 설정과 `include` 쿼리 파라미터를 함께 사용합니다.
- **보안 강화**: allowedIncludes를 설정하지 않으면 모든 관계 포함이 차단됩니다.

```bash
# 단일 관계 (allowedIncludes에 허용된 관계만)
GET /users?include=department
GET /posts?include=author

# 다중 관계
GET /users?include=department,posts
GET /posts?include=author,comments

# 중첩 관계
GET /posts?include=author,comments.author
GET /users?include=department.company,posts.comments
GET /orders?include=customer.address,items.product.category
```

#### 변경 전후 비교

```typescript
// ❌ 이전 방식 (deprecated)
@Crud({
  entity: User,
  routes: {
    index: {
      relations: ['department', 'posts'], // 기본적으로 관계 포함
    }
  }
})

// ✅ 새로운 방식 (보안 강화)
@Crud({
  entity: User,
  allowedIncludes: ['department', 'posts'], // 허용된 관계 명시
  routes: {
    index: {
      allowedIncludes: ['department', 'posts', 'posts.comments'], // 메서드별 추가 허용
    }
  }
})

// 관계가 필요한 경우 쿼리 파라미터로 명시적 요청
GET /users?include=department,posts
```

#### 보안 정책

```typescript
// 1. allowedIncludes 미설정 → 모든 관계 차단
@Crud({
  entity: User,
  // allowedIncludes 없음 → 모든 include 무시됨
})

// 2. 전역 설정
@Crud({
  entity: User,
  allowedIncludes: ['department'], // department만 허용
})

// 3. 메서드별 설정 (우선순위 높음)
@Crud({
  entity: User,
  allowedIncludes: ['department'], // 전역: department만
  routes: {
    index: {
      allowedIncludes: ['department', 'posts'], // INDEX는 posts도 추가 허용
    },
    show: {
      // allowedIncludes 없음 → 전역 설정 사용: department만
    },
  },
})
```

#### 장점

1. **보안 강화**: 명시적으로 허용된 관계만 포함 가능
2. **명시적 요청**: 필요한 관계만 선택적으로 로드
3. **성능 최적화**: 불필요한 관계 로딩 방지
4. **N+1 문제 방지**: 필요한 관계만 JOIN으로 처리
5. **세밀한 제어**: 메서드별로 다른 관계 포함 정책 적용

### 📄 페이지네이션 (Pagination)

#### 페이지 번호 방식

```bash
GET /users?page[number]=1&page[size]=10     # 1페이지, 10개씩
GET /users?page[number]=3&page[size]=20     # 3페이지, 20개씩
```

#### 오프셋 방식

```bash
GET /users?page[offset]=0&page[limit]=10    # 처음부터 10개
GET /users?page[offset]=20&page[limit]=10   # 20번째부터 10개
```

#### 커서 방식

```bash
GET /users?page[cursor]=eyJpZCI6MTB9&page[size]=10
```

### 📊 페이지네이션 응답 구조

#### Offset/Number 페이지네이션 응답

```json
{
  "data": [
    { "id": 1, "name": "홍길동", "email": "hong@example.com" },
    { "id": 2, "name": "김철수", "email": "kim@example.com" }
  ],
  "metadata": {
    "page": 1,           // 현재 페이지 번호
    "pages": 10,         // 총 페이지 수 ✅
    "total": 95,         // 총 데이터 개수
    "offset": 10,        // 다음 오프셋
    "nextCursor": "..."  // 다음 페이지 토큰
  }
}
```

#### Cursor 페이지네이션 응답

```json
{
  "data": [
    { "id": 1, "name": "홍길동", "email": "hong@example.com" },
    { "id": 2, "name": "김철수", "email": "kim@example.com" }
  ],
  "metadata": {
    "total": 95,         // 총 데이터 개수
    "totalPages": 10,    // 총 페이지 수 ✅
    "limit": 10,         // 페이지 크기
    "nextCursor": "..."  // 다음 페이지 토큰
  }
}
```

### 🔍 복합 쿼리 예제

실제 사용 사례들을 통해 복합 쿼리 사용법을 확인해보세요:

#### 사용자 검색 예제

```bash
# 활성 상태의 성인 사용자를 최근 가입순으로 10명 조회
GET /users?filter[status_eq]=active&
          filter[age_gte]=18&
          sort=-created_at&
          page[number]=1&page[size]=10
```

#### 게시물 검색 예제

```bash
# 특정 작성자의 공개 게시물을 작성자 정보와 함께 조회
GET /posts?filter[author.name_like]=%김%&
          filter[status_eq]=published&
          filter[created_at_gte]=2024-01-01&
          include=author,comments&
          sort=-created_at,title&
          page[number]=1&page[size]=20
```

#### 주문 검색 예제

```bash
# 완료된 주문을 고객 정보, 주문 상품과 함께 조회
GET /orders?filter[status_eq]=completed&
           filter[total_amount_gte]=50000&
           filter[created_at_between]=2024-01-01,2024-12-31&
           include=customer.address,items.product&
           sort=-created_at&
           page[offset]=0&page[limit]=50
```

## ⚙️ 고급 설정

### 🔒 보안 제어 설정

#### 필터링 제한 - allowedFilters

```typescript
@Controller('users')
@Crud({
  entity: User,
  allowedFilters: ['name', 'email', 'status'], // 전역: 이 컬럼들만 필터링 허용
  routes: {
    index: {
      allowedFilters: ['name', 'email', 'status', 'createdAt'], // INDEX는 더 많은 컬럼 허용
    },
    show: {
      allowedFilters: ['name'], // SHOW는 name만 허용
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

**동작 예시:**
```bash
# ✅ 허용된 컬럼 - 정상 작동
GET /users?filter[name_like]=%김%
GET /users?filter[email_eq]=test@example.com

# ❌ 허용되지 않은 컬럼 - 필터 무시됨
GET /users?filter[password_eq]=secret  # password가 allowedFilters에 없으면 무시
```

#### 파라미터 제한 - allowedParams

```typescript
@Controller('users')  
@Crud({
  entity: User,
  allowedParams: ['name', 'email'], // 전역: 이 컬럼들만 요청 파라미터로 허용
  routes: {
    create: {
      allowedParams: ['name', 'email', 'status'], // CREATE는 status 추가 허용
    },
    update: {
      allowedParams: ['name'], // UPDATE는 name만 허용
    },
    upsert: {
      // allowedParams 없음 -> 전역 설정 사용: name, email만
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

**동작 예시:**
```typescript
// 설정: allowedParams: ['name', 'email']

// ✅ 허용된 파라미터만 처리됨
POST /users
{
  "name": "홍길동",        // ✅ 처리됨
  "email": "hong@test.com", // ✅ 처리됨
  "password": "secret",     // ❌ 제거됨 (allowedParams에 없음)
  "internal_id": 123        // ❌ 제거됨 (allowedParams에 없음)
}

// 실제 처리되는 데이터:
{
  "name": "홍길동",
  "email": "hong@test.com"
}
```

#### 관계 포함 제한 - allowedIncludes

```typescript
@Controller('posts')
@Crud({
  entity: Post,
  allowedIncludes: ['author'], // 전역: author 관계만 포함 허용
  routes: {
    index: {
      allowedIncludes: ['author', 'comments', 'tags'], // INDEX는 더 많은 관계 허용
    },
    show: {
      allowedIncludes: ['author', 'comments.author'], // SHOW는 중첩 관계까지 허용
    },
  },
})
export class PostController {
  constructor(public readonly crudService: PostService) {}
}
```

**동작 예시:**
```bash
# ✅ 허용된 관계만 포함됨
GET /posts?include=author           # ✅ 포함됨
GET /posts?include=comments         # ✅ 포함됨 (INDEX에서)
GET /posts?include=author,comments  # ✅ 둘 다 포함됨

# ❌ 허용되지 않은 관계는 무시됨
GET /posts?include=author,likes,comments  # ✅ author,comments만 포함됨 (likes 무시)
GET /posts?include=profile               # ❌ 모든 관계 무시됨 (profile 허용안됨)
```

### 🎛️ CRUD 옵션 설정

```typescript
@Controller('users')
@Crud({
  entity: User,
  only: ['index', 'show', 'create', 'update'], // 특정 메서드만 활성화
  allowedFilters: ['name', 'email', 'status'], // 허용된 필터 컬럼
  allowedParams: ['name', 'email', 'bio'],     // 허용된 요청 파라미터
  allowedIncludes: ['department', 'posts'],    // 허용된 관계 포함
  routes: {
    index: {
      paginationType: PaginationType.OFFSET,
      numberOfTake: 20,
      sort: Sort.DESC,
      softDelete: false,
      allowedFilters: ['name', 'email', 'status', 'createdAt'], // 메서드별 필터 설정
      allowedIncludes: ['department', 'posts', 'posts.comments'], // 메서드별 관계 설정
    },
    show: {
      softDelete: true,
      allowedFilters: ['name', 'email'], // SHOW는 제한적 필터링
      allowedIncludes: ['department'], // SHOW는 기본 관계만
    },
          create: {
        hooks: {
          assignBefore: async (body, context) => {
            // 이메일 정규화
            if (body.email) {
              body.email = body.email.toLowerCase().trim();
            }
            return body;
          },
          saveAfter: async (entity, context) => {
            // 사용자 생성 이벤트 발송
            await eventBus.publish('user.created', entity);
            return entity;
          },
        },
      },
          update: {
        hooks: {
          assignBefore: async (body, context) => {
            body.updatedAt = new Date();
            return body;
          },
        },
      },
          destroy: {
        softDelete: true,
      },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

### 🔄 생명주기 훅 (Lifecycle Hooks)

생명주기 훅을 통해 CRUD 작업의 각 단계에서 커스텀 로직을 실행할 수 있습니다.

#### 훅 타입

| 훅 | 실행 시점 | 용도 | 지원 라우트 |
|---|----------|------|-------------|
| `assignBefore` | 데이터 할당 **전** | 입력 검증, 변환 | create, update, upsert |
| `assignAfter` | 데이터 할당 **후** | 엔티티 후처리 | create, update, upsert |
| `saveBefore` | 저장 **전** | 최종 검증, 비즈니스 로직 | create, update, upsert |
| `saveAfter` | 저장 **후** | 알림, 이벤트 발생 | create, update, upsert |

#### 기본 사용법

```typescript
@Controller('users')
@Crud({
  entity: User,
  routes: {
    create: {
      hooks: {
        assignBefore: async (body, context) => {
          // 이메일을 소문자로 변환
          if (body.email) {
            body.email = body.email.toLowerCase();
          }
          return body;
        },
        
        assignAfter: async (entity, body, context) => {
          // 기본 역할 설정
          if (!entity.role) {
            entity.role = 'user';
          }
          return entity;
        },
        
        saveBefore: async (entity, context) => {
          // 중복 이메일 검사
          const existing = await userService.findByEmail(entity.email);
          if (existing) {
            throw new Error('이미 존재하는 이메일입니다');
          }
          return entity;
        },
        
        saveAfter: async (entity, context) => {
          // 환영 이메일 발송
          await emailService.sendWelcomeEmail(entity.email);
          return entity;
        },
      },
    },
    
    update: {
      hooks: {
        assignBefore: async (body, context) => {
          // 업데이트 시간 자동 설정
          body.updatedAt = new Date();
          
          // 특정 필드는 수정 불가
          delete body.id;
          delete body.createdAt;
          
          return body;
        },
        
        saveBefore: async (entity, context) => {
          // 권한 확인
          const userId = context.request?.user?.id;
          if (entity.id !== userId) {
            throw new Error('권한이 없습니다');
          }
          return entity;
        },
      },
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

#### 고급 활용 예제

```typescript
@Controller('posts')
@Crud({
  entity: Post,
  routes: {
    create: {
      hooks: {
        assignBefore: async (body, context) => {
          // 사용자 ID 자동 설정
          const userId = context.request?.user?.id;
          if (userId) {
            body.userId = userId;
          }
          
          // 슬러그 자동 생성
          if (body.title && !body.slug) {
            body.slug = slugify(body.title);
          }
          
          return body;
        },
        
        assignAfter: async (entity, body, context) => {
          // 게시글 상태 기본값 설정
          if (!entity.status) {
            entity.status = 'draft';
          }
          
          // 발행 시 발행일 설정
          if (entity.status === 'published' && !entity.publishedAt) {
            entity.publishedAt = new Date();
          }
          
          return entity;
        },
        
        saveBefore: async (entity, context) => {
          // 필수 필드 검증
          if (!entity.title?.trim()) {
            throw new Error('제목은 필수입니다');
          }
          
          // 슬러그 중복 검사 및 해결
          const existingPost = await postService.findBySlug(entity.slug);
          if (existingPost) {
            entity.slug = `${entity.slug}-${Date.now()}`;
          }
          
          return entity;
        },
        
        saveAfter: async (entity, context) => {
          // 검색 인덱스 업데이트
          await searchService.indexPost(entity);
          
          // 태그 처리
          if (entity.tags?.length) {
            await tagService.processPostTags(entity.id, entity.tags);
          }
          
          // 발행된 게시글 알림
          if (entity.status === 'published') {
            await notificationService.notifyNewPost(entity);
          }
          
          return entity;
        },
      },
    },
    
    upsert: {
      hooks: {
        assignBefore: async (body, context) => {
          const now = new Date();
          body.updatedAt = now;
          
          // 새 데이터인 경우만 생성일 설정
          if (!context.currentEntity) {
            body.createdAt = now;
          }
          
          return body;
        },
        
        saveAfter: async (entity, context) => {
          // 새로 생성된 경우와 업데이트된 경우 구분 처리
          const isNew = !context.currentEntity;
          
          if (isNew) {
            await analyticsService.trackPostCreated(entity);
          } else {
            await analyticsService.trackPostUpdated(entity);
          }
          
          return entity;
        },
      },
    },
  },
})
export class PostController {
  constructor(public readonly crudService: PostService) {}
}
```

#### HookContext 활용

```typescript
// HookContext는 다음 정보를 제공합니다
interface HookContext<T> {
  operation: 'create' | 'update' | 'upsert';  // 작업 타입
  params?: Record<string, any>;               // URL 파라미터  
  currentEntity?: T;                          // 현재 엔티티 (update, upsert)
  request?: any;                              // Express Request 객체
}

// 컨텍스트 활용 예시
const hooks = {
  assignBefore: async (body, context) => {
    console.log(`작업 타입: ${context.operation}`);
    
    // 요청자 정보 활용
    if (context.request?.user) {
      body.lastModifiedBy = context.request.user.id;
    }
    
    // URL 파라미터 활용
    if (context.params?.parentId) {
      body.parentId = context.params.parentId;
    }
    
    // 기존 엔티티 정보 활용 (update, upsert만)
    if (context.currentEntity) {
      console.log('기존 데이터:', context.currentEntity);
    }
    
    return body;
  },
};
```

#### 공통 훅 함수 재사용

```typescript
// 공통 훅 함수 정의
const commonHooks = {
  setTimestamps: async (body: any, context: HookContext) => {
    const now = new Date();
    body.updatedAt = now;
    
    if (context.operation === 'create') {
      body.createdAt = now;
    }
    
    return body;
  },
  
  validateOwnership: async (entity: any, context: HookContext) => {
    const userId = context.request?.user?.id;
    if (entity.userId && entity.userId !== userId) {
      const userRole = context.request?.user?.role;
      if (userRole !== 'admin') {
        throw new Error('권한이 없습니다');
      }
    }
    return entity;
  },
  
  publishEvent: async (entity: any, context: HookContext) => {
    const eventName = `${context.operation}_${entity.constructor.name.toLowerCase()}`;
    await eventBus.publish(eventName, entity);
    return entity;
  },
};

// 여러 컨트롤러에서 재사용
@Crud({
  entity: Order,
  routes: {
    create: {
      hooks: {
        assignBefore: commonHooks.setTimestamps,
        saveBefore: commonHooks.validateOwnership,
        saveAfter: commonHooks.publishEvent,
      },
    },
    update: {
      hooks: {
        assignBefore: commonHooks.setTimestamps,
        saveBefore: commonHooks.validateOwnership,
        saveAfter: commonHooks.publishEvent,
      },
    },
  },
})
export class OrderController {}
```

#### 주의사항

1. **비동기 처리**: 모든 훅은 비동기 함수를 지원합니다
2. **에러 처리**: 훅에서 에러 발생 시 전체 CRUD 작업이 중단됩니다
3. **성능**: 복잡한 로직은 성능에 영향을 줄 수 있으므로 주의가 필요합니다
4. **트랜잭션**: 훅은 별도의 데이터베이스 트랜잭션에서 실행됩니다
5. **순서**: 정의된 순서대로 실행되므로 의존성을 고려해야 합니다

### 🔐 인증 및 권한

```typescript
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Crud({
  entity: User,
  routes: {
    index: {
      decorators: [Roles('admin', 'manager')],
    },
    create: {
      decorators: [Roles('admin')],
    },
    update: {
      decorators: [Roles('admin', 'manager')],
    },
    destroy: {
      decorators: [Roles('admin')],
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

### 🎨 커스텀 DTO

```typescript
// dto/create-user.dto.ts
import { PickType } from '@nestjs/mapped-types';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { User } from '../entities/user.entity';

export class CreateUserDto extends PickType(User, [
  'name',
  'email',
  'bio',
] as const) {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  bio?: string;
}

// user.controller.ts
@Crud({
  entity: User,
  routes: {
    create: {
      swagger: {
        body: CreateUserDto,
      },
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

### 🔄 인터셉터 활용

```typescript
// interceptors/user.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class UserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => {
        // 민감한 정보 제거
        if (Array.isArray(data.data)) {
          data.data = data.data.map(user => {
            delete user.password;
            return user;
          });
        } else if (data.data) {
          delete data.data.password;
        }
        return data;
      }),
    );
  }
}

// user.controller.ts
@Controller('users')
@Crud({
  entity: User,
  routes: {
    index: {
      interceptors: [UserInterceptor],
    },
    show: {
      interceptors: [UserInterceptor],
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

## 📊 Swagger 문서

### 자동 생성된 API 문서

nestjs-crud는 모든 엔드포인트에 대한 Swagger 문서를 자동으로 생성합니다:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('API 문서')
    .setDescription('nestjs-crud로 생성된 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(3000);
}
bootstrap();
```

### 커스텀 Swagger 설정

```typescript
@Crud({
  entity: User,
  routes: {
    index: {
      swagger: {
        response: UserListResponseDto,
        hide: false, // API 문서에서 숨기기
      },
    },
    show: {
      swagger: {
        response: UserDetailResponseDto,
      },
    },
    create: {
      swagger: {
        body: CreateUserDto,
        response: UserResponseDto,
      },
    },
  },
})
export class UserController {}
```

## 📋 전체 필터 연산자 목록

| Suffix | 의미 | 예시 | 설명 |
|--------|------|------|------|
| `_eq` | 같음 | `name_eq=김철수` | 정확히 일치 |
| `_ne` | 다름 | `status_ne=inactive` | 일치하지 않음 |
| `_gt` | 초과 | `age_gt=18` | 큰 값 |
| `_gte` | 이상 | `age_gte=18` | 크거나 같음 |
| `_lt` | 미만 | `age_lt=65` | 작은 값 |
| `_lte` | 이하 | `age_lte=65` | 작거나 같음 |
| `_between` | 범위 | `age_between=18,65` | 두 값 사이 |
| `_like` | 패턴 | `name_like=%김%` | SQL LIKE |
| `_ilike` | 대소문자 무시 패턴 | `email_ilike=%GMAIL%` | 대소문자 구분 없음 |
| `_start` | 시작 | `name_start=김` | 특정 문자로 시작 |
| `_end` | 끝 | `email_end=.com` | 특정 문자로 끝 |
| `_contains` | 포함 | `bio_contains=개발자` | 문자열 포함 |
| `_in` | 포함 | `id_in=1,2,3` | 배열에 포함 |
| `_not_in` | 미포함 | `role_not_in=guest,banned` | 배열에 미포함 |
| `_null` | NULL | `deleted_at_null=true` | NULL 값 |
| `_not_null` | NOT NULL | `email_not_null=true` | NULL이 아님 |
| `_present` | 존재 | `bio_present=true` | NULL도 빈값도 아님 |
| `_blank` | 공백 | `middle_name_blank=true` | NULL이거나 빈값 |

## 🛠 실전 예제

### 블로그 시스템

```typescript
// entities/post.entity.ts
@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ default: 'draft' })
  status: 'draft' | 'published' | 'archived';

  @ManyToOne(() => User, user => user.posts)
  author: User;

  @OneToMany(() => Comment, comment => comment.post)
  comments: Comment[];

  @ManyToMany(() => Tag, tag => tag.posts)
  @JoinTable()
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// post.controller.ts
@Controller('posts')
@Crud({
  entity: Post,
  // 보안 제어 설정
  allowedFilters: ['title', 'status', 'author.name'], // 허용된 필터 컬럼
  allowedParams: ['title', 'content', 'status'], // 허용된 요청 파라미터
  allowedIncludes: ['author'], // 전역: author 관계만 허용
  routes: {
    index: {
      paginationType: PaginationType.OFFSET,
      numberOfTake: 10,
      allowedFilters: ['title', 'status', 'author.name', 'createdAt'], // INDEX는 생성일 필터 추가
      allowedIncludes: ['author', 'tags'], // INDEX는 태그도 포함 허용
    },
    show: {
      allowedIncludes: ['author', 'comments', 'comments.author', 'tags'], // SHOW는 댓글까지 허용
    },
    create: {
      hooks: {
                 assignBefore: async (body, context) => {
           // 사용자 ID 자동 설정 (인증된 사용자)
           if (context.request?.user?.id) {
             body.userId = context.request.user.id;
           }
           
           // 슬러그 생성
           if (body.title && !body.slug) {
             body.slug = body.title
               .toLowerCase()
               .replace(/[^a-z0-9]/g, '-')
               .replace(/-+/g, '-')
               .replace(/^-|-$/g, '');
           }
           
           return body;
         },
        
        saveBefore: async (entity, context) => {
          // 슬러그 중복 검사
          const existing = await postService.findBySlug(entity.slug);
          if (existing) {
            entity.slug = `${entity.slug}-${Date.now()}`;
          }
          return entity;
        },
        
        saveAfter: async (entity, context) => {
          // 검색 인덱스 업데이트
          await searchService.indexPost(entity);
          
          // 발행된 게시물 알림
          if (entity.status === 'published') {
            await notificationService.notifyFollowers(entity.userId, entity);
          }
          
          return entity;
        },
      },
    },
    update: {
      hooks: {
        assignBefore: async (body, context) => {
          body.updatedAt = new Date();
          
          // 발행 상태 변경 시 발행일 설정
          if (body.status === 'published' && context.currentEntity?.status !== 'published') {
            body.publishedAt = new Date();
          }
          
          return body;
        },
        
        saveBefore: async (entity, context) => {
          // 작성자 권한 확인
          const userId = context.request?.user?.id;
          if (entity.userId !== userId) {
            const userRole = context.request?.user?.role;
            if (userRole !== 'admin' && userRole !== 'editor') {
              throw new Error('수정 권한이 없습니다');
            }
          }
          return entity;
        },
      },
    },
  },
})
export class PostController {
  constructor(public readonly crudService: PostService) {}
}
```

### 쿼리 예제

```bash
# 공개된 게시물을 최신순으로 조회 (작성자, 태그 포함)
# ✅ status, createdAt은 allowedFilters에 있고, author,tags는 allowedIncludes에 있음
GET /posts?filter[status_eq]=published&sort=-created_at&include=author,tags&page[number]=1&page[size]=10

# 특정 작성자의 게시물 검색 (작성자 정보 포함)
# ✅ author.name은 allowedFilters에 있고, author는 allowedIncludes에 있음
GET /posts?filter[author.name_like]=%김%&filter[status_ne]=draft&include=author&sort=-created_at

# ❌ 허용되지 않은 필터는 무시됨
GET /posts?filter[internal_id_gt]=100&filter[status_eq]=published  # internal_id 필터는 무시됨

# ❌ 허용되지 않은 관계는 무시됨  
GET /posts?include=author,categories,tags  # categories는 allowedIncludes에 없으므로 무시됨

# 댓글과 댓글 작성자 정보를 포함한 게시물 조회 (SHOW 엔드포인트에서만 가능)
GET /posts/1?include=author,comments,comments.author&sort=-created_at

# 관계 없이 게시물만 조회 (include 파라미터 없음)
GET /posts?filter[status_eq]=published&sort=-created_at&page[number]=1&page[size]=10
```

**보안 동작 설명:**
- `allowedFilters: ['title', 'status', 'author.name', 'createdAt']` - 이 컬럼들만 필터링 가능
- `allowedIncludes: ['author', 'tags', 'comments', 'comments.author']` - 이 관계들만 포함 가능
- 허용되지 않은 필터나 관계는 자동으로 무시됨

## 🚨 주의사항

### 보안 고려사항

1. **보안 기본 정책**: 
   - `allowedFilters`, `allowedParams`, `allowedIncludes` 미설정 시 모든 접근 차단
   - 명시적으로 허용된 컬럼/관계만 사용 가능
   - 프로덕션 환경에서는 반드시 허용 목록 설정 권장

2. **민감한 필드 보호**: 
   - 비밀번호, 내부 ID 등은 `allowedFilters`, `allowedParams`에서 제외
   - 응답에서도 `exclude` 옵션으로 민감한 정보 제외

3. **인증/권한 검사**: 적절한 Guard 사용
4. **입력 검증**: class-validator로 철저한 검증
5. **SQL 인젝션 방지**: TypeORM의 파라미터화된 쿼리 사용

### 성능 최적화

1. **관계 로딩 제한**: 
   - `allowedIncludes`로 필요한 관계만 허용
   - 중첩 관계는 신중하게 허용 (N+1 문제 주의)

2. **필터링 최적화**:
   - 자주 사용되는 `allowedFilters` 필드에 데이터베이스 인덱스 추가
   - 복잡한 조건의 필터는 성능 테스트 필수

3. **페이지네이션 활용**: 대용량 데이터 처리 시 필수
4. **캐싱 전략**: Redis 등을 활용한 응답 캐싱

## 📚 추가 자료

### 관련 문서
- [NestJS 공식 문서](https://nestjs.com/)
- [TypeORM 공식 문서](https://typeorm.io/)
- [class-validator 문서](https://github.com/typestack/class-validator)

---

**nestjs-crud**로 강력하고 유연한 REST API를 빠르게 구축하세요! 🚀 