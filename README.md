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
- **작성자 추적**: 생성/수정/삭제 작성자 자동 기록

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
| **POST** | `/users/search` | 사용자 검색 | `search` |
| **POST** | `/users/:id/recover` | 삭제된 사용자 복구 | `recover` |

### 📊 통일된 응답 구조

모든 CRUD 작업은 메타데이터를 포함한 일관된 응답 구조를 제공합니다:

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

```bash
# 단일 관계
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

### 🎛️ CRUD 옵션 설정

```typescript
@Controller('users')
@Crud({
  entity: User,
  only: ['index', 'show', 'create', 'update'], // 특정 메서드만 활성화
  routes: {
    index: {
      paginationType: PaginationType.OFFSET,
      numberOfTake: 20,
      sort: Sort.DESC,
      softDelete: false,
      relations: ['department', 'posts'],
    },
    show: {
      relations: ['department', 'posts', 'posts.comments'],
      softDelete: true,
    },
    create: {
      author: {
        property: 'createdBy',
        filter: 'user.id',
      },
    },
    update: {
      author: {
        property: 'updatedBy', 
        filter: 'user.id',
      },
    },
    destroy: {
      softDelete: true,
      author: {
        property: 'deletedBy',
        filter: 'user.id',
      },
    },
  },
})
export class UserController {
  constructor(public readonly crudService: UserService) {}
}
```

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
  routes: {
    index: {
      relations: ['author', 'tags'],
      paginationType: PaginationType.OFFSET,
      numberOfTake: 10,
    },
    show: {
      relations: ['author', 'comments', 'comments.author', 'tags'],
    },
  },
})
export class PostController {
  constructor(public readonly crudService: PostService) {}
}
```

### 쿼리 예제

```bash
# 공개된 게시물을 최신순으로 조회
GET /posts?filter[status_eq]=published&sort=-created_at&include=author,tags&page[number]=1&page[size]=10

# 특정 작성자의 게시물 검색
GET /posts?filter[author.name_like]=%김%&filter[status_ne]=draft&include=author&sort=-created_at

# 특정 태그를 포함하는 게시물
GET /posts?filter[tags.name_in]=javascript,typescript&include=author,tags&sort=-created_at

# 댓글이 많은 게시물 (커스텀 쿼리 필요)
GET /posts?include=comments&sort=-comments_count&page[limit]=20
```

## 🚨 주의사항

### 보안 고려사항

1. **민감한 필드 제외**: 비밀번호 등 민감한 정보는 응답에서 제외
2. **인증/권한 검사**: 적절한 Guard 사용
3. **입력 검증**: class-validator로 철저한 검증
4. **SQL 인젝션 방지**: TypeORM의 파라미터화된 쿼리 사용

### 성능 최적화

1. **관계 로딩 제한**: 필요한 관계만 포함
2. **페이지네이션 활용**: 대용량 데이터 처리 시 필수
3. **인덱스 설정**: 자주 사용되는 필터 필드에 인덱스 추가
4. **캐싱 전략**: Redis 등을 활용한 응답 캐싱

## 📚 추가 자료

### 관련 문서
- [NestJS 공식 문서](https://nestjs.com/)
- [TypeORM 공식 문서](https://typeorm.io/)
- [class-validator 문서](https://github.com/typestack/class-validator)

## 🤝 기여하기

버그 리포트, 기능 제안, 풀 리퀘스트를 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE.md) 파일을 참조하세요.

---

**nestjs-crud**로 강력하고 유연한 REST API를 빠르게 구축하세요! 🚀 