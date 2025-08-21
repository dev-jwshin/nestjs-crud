# @foryourdev/nestjs-crud 사용 가이드

이 패키지는 NestJS와 TypeORM 기반으로 RESTful CRUD API를 자동 생성하는 라이브러리입니다.

## 설치

```bash
npm install @foryourdev/nestjs-crud
# 필수 의존성
npm install @nestjs/common @nestjs/core typeorm class-validator class-transformer
```

## 기본 사용법

### 1. Entity 생성

```typescript
// user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn } from 'typeorm';
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
    
    @Column({ select: false })
    password: string;
    
    @DeleteDateColumn()
    deletedAt?: Date;
}
```

### 2. Service 생성

```typescript
// user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CrudService } from '@foryourdev/nestjs-crud';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UserService extends CrudService<User> {
    constructor(@InjectRepository(User) repository: Repository<User>) {
        super(repository);
    }
}
```

### 3. Controller에 @Crud 데코레이터 적용

```typescript
// user.controller.ts
import { Controller } from '@nestjs/common';
import { Crud } from '@foryourdev/nestjs-crud';
import { User } from './user.entity';
import { UserService } from './user.service';

@Controller('users')
@Crud({
    entity: User,
    logging: false,
    allowedParams: ['name', 'email', 'bio'],
    exclude: ['password'],
    allowedFilters: ['name', 'email', 'status'],
    allowedIncludes: ['posts', 'profile']
})
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

## 자동 생성되는 엔드포인트

다음 7개의 기본 엔드포인트가 자동 생성됩니다:

| 메서드 | 경로 | 설명 | 벌크 지원 |
|--------|------|------|-----------|
| GET | `/users` | 목록 조회 (페이지네이션, 필터링, 정렬) | - |
| GET | `/users/:id` | 단일 조회 | - |
| POST | `/users` | 생성 | ✅ 배열 전송으로 벌크 생성 |
| PUT | `/users/:id` | 전체 수정 또는 생성 (Upsert) | ✅ 배열 전송으로 벌크 upsert |
| PATCH | `/users/:id` | 부분 수정 | ✅ 배열 전송으로 벌크 수정 |
| DELETE | `/users/:id` | 삭제 | ✅ body에 배열 전송으로 벌크 삭제 |
| POST | `/users/:id/recover` | 소프트 삭제 복구 | ✅ body에 배열 전송으로 벌크 복구 |

### 벌크 작업 예시

```bash
# 벌크 생성 - POST /users에 배열 전송
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "John", "email": "john@example.com"},
    {"name": "Jane", "email": "jane@example.com"}
  ]'

# 벌크 수정 - PATCH /users/:id에 배열 전송 (id는 배열 내 각 객체에 포함)
curl -X PATCH http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '[
    {"id": 1, "name": "John Updated"},
    {"id": 2, "name": "Jane Updated"}
  ]'

# 벌크 삭제 - DELETE /users/:id에 body로 ID 배열 전송
curl -X DELETE http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"ids": [1, 2, 3]}'

# 벌크 복구 - POST /users/:id/recover에 ID 배열 전송
curl -X POST http://localhost:3000/users/1/recover \
  -H "Content-Type: application/json" \
  -d '{"ids": [1, 2, 3]}'
```

## 쿼리 파라미터 사용법

### 필터링

```bash
# 단일 필터 (field_operator 형식)
GET /users?filter[name_like]=John
GET /users?filter[age_gt]=18

# 다중 필터
GET /users?filter[status_eq]=active&filter[age_gte]=18

# 지원 연산자 (총 18개)
_eq       # 같음
_ne       # 같지 않음  
_gt       # 큼
_gte      # 크거나 같음
_lt       # 작음
_lte      # 작거나 같음
_like     # LIKE (대소문자 구분)
_ilike    # ILIKE (대소문자 무시)
_start    # 시작 문자열
_end      # 끝 문자열
_contains # 포함
_in       # IN (콤마로 구분: 1,2,3)
_not_in   # NOT IN
_between  # BETWEEN (콤마로 구분: 10,20)
_null     # IS NULL (값: true)
_not_null # IS NOT NULL (값: true)
_present  # 값이 존재 (not null and not empty)
_blank    # 값이 비어있음 (null or empty)
```

### 페이지네이션

```bash
# Offset 방식
GET /users?page[offset]=10&page[limit]=20

# Page 방식
GET /users?page[number]=2&page[size]=20

# Cursor 방식 (기본값)
GET /users?page[cursor]=eyJpZCI6MTB9&page[limit]=20
```

### 정렬

```bash
# 오름차순
GET /users?sort=name,created_at

# 내림차순 (- 접두사)
GET /users?sort=-created_at,name

# 중첩 관계 정렬
GET /users?sort=department.name,-created_at
```

### 관계 포함

```bash
# 단일 관계
GET /users?include=profile

# 다중 관계
GET /users?include=posts,profile

# 중첩 관계
GET /users?include=posts,posts.comments,posts.author
```

## 생명주기 훅

### 데코레이터 방식 (권장)

```typescript
import { 
    BeforeCreate, AfterCreate,
    BeforeUpdate, AfterUpdate,
    BeforeDestroy, AfterDestroy,
    BeforeRecover, AfterRecover,
    BeforeShow, AfterShow,
    BeforeAssign, AfterAssign,
    BeforeSave, AfterSave
} from '@foryourdev/nestjs-crud';

@Injectable()
export class UserService extends CrudService<User> {
    @BeforeCreate()
    async hashPassword(entity: User) {
        if (entity.password) {
            entity.password = await bcrypt.hash(entity.password, 10);
        }
    }

    @AfterCreate()
    async sendWelcomeEmail(entity: User) {
        await this.emailService.sendWelcome(entity.email);
    }

    @BeforeUpdate()
    async validateUpdate(entity: User, context: HookContext<User>) {
        // context.currentEntity로 기존 엔티티 접근 가능
        if (entity.email !== context.currentEntity?.email) {
            await this.validateEmailUnique(entity.email);
        }
    }
}
```

### 설정 방식 (레거시)

```typescript
@Crud({
    entity: User,
    routes: {
        create: {
            hooks: {
                assignBefore: async (entity) => { 
                    entity.createdAt = new Date();
                },
                saveBefore: async (entity) => { 
                    entity.password = await bcrypt.hash(entity.password, 10);
                },
                saveAfter: async (entity) => {
                    await this.auditLog.create('USER_CREATED', entity);
                }
            }
        }
    }
})
```

## 소프트 삭제 & 복구

```typescript
@Crud({
    entity: User,
    routes: {
        destroy: { 
            softDelete: true  // 실제 삭제 대신 deletedAt 필드 업데이트
        },
        recover: { 
            enabled: true     // POST /users/:id/recover 엔드포인트 활성화
        }
    }
})

// Entity에 soft delete 컬럼 추가
@Entity()
export class User {
    @DeleteDateColumn()
    deletedAt?: Date;
}
```

## 커스텀 라우트에서 CRUD 기능 사용하기

### CrudQueryHelper - 쿼리 기능 유지

```typescript
import { CrudQueryHelper } from '@foryourdev/nestjs-crud';

@Get('/active')
async getActiveUsers(@Req() req: Request) {
    const qb = this.repository.createQueryBuilder('user')
        .where('user.isActive = :active', { active: true });
    
    // 필터링, 정렬, 페이지네이션 자동 적용
    const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
        allowedFilterFields: ['name', 'email', 'role'],
        defaultLimit: 20
    });
    
    return result;
}
```

### CrudOperationHelper - 검증과 훅 유지

```typescript
import { CrudOperationHelper } from '@foryourdev/nestjs-crud';

@Injectable()
export class UserService extends CrudService<User> {
    private crudHelper: CrudOperationHelper<User>;
    
    constructor(@InjectRepository(User) repository: Repository<User>) {
        super(repository);
        this.crudHelper = new CrudOperationHelper(repository, crudOptions);
    }
    
    // 커스텀 생성 메서드
    async createWithRole(data: CreateUserDto, role: string) {
        // CRUD의 validation과 hooks 사용
        const user = await this.crudHelper.create({
            ...data,
            role
        }, {
            validate: true,
            allowedParams: ['name', 'email', 'role'],
            hooks: {
                saveBefore: async (entity) => {
                    entity.password = await bcrypt.hash(entity.password, 10);
                }
            }
        });
        
        return user;
    }
    
    // 최적화된 응답 포함 메서드
    async createWithResponse(data: CreateUserDto) {
        return await this.crudHelper.createWithResponse(data, {
            validate: true,
            responseOptions: {
                excludedFields: ['password'],
                skipTransform: true  // 98.9% 성능 향상
            }
        });
    }
}
```

## crudResponse - 일관된 응답 형식

```typescript
import { crudResponse } from '@foryourdev/nestjs-crud';

// 단일 객체 응답
@Get('/profile')
async getProfile(@CurrentUser() user: User) {
    return crudResponse(user, {
        excludedFields: ['password', 'refreshToken'],
        includedRelations: ['profile', 'settings']
    });
}

// 배열 응답 with 페이지네이션
@Get('/search')
async searchUsers(@Query() query: any) {
    const users = await this.userService.search(query);
    
    return crudResponse(users, {
        paginationType: 'offset',
        limit: 20,
        page: query.page || 1,
        excludedFields: ['password']
    }, { query });
}

// 성능 최적화 (이미 변환된 데이터)
@Post('/bulk')
async bulkCreate(@Body() users: CreateUserDto[]) {
    const created = await this.crudHelper.bulkCreate(users);
    
    return crudResponse(created, {
        skipTransform: true,  // 중복 변환 방지 (98.9% 성능 향상)
        excludedFields: ['password']
    });
}
```

## @Crud 데코레이터 옵션

```typescript
@Crud({
    entity: User,
    
    // 보안 설정
    allowedParams: ['name', 'email', 'bio'],      // CREATE/UPDATE 허용 필드
    allowedFilters: ['name', 'email', 'status'],  // 필터링 허용 필드
    allowedIncludes: ['posts', 'profile'],        // 관계 포함 허용
    exclude: ['password', 'refreshToken'],        // 응답에서 제외할 필드
    
    // 라우트별 설정
    routes: {
        create: {
            enabled: true,
            allowedParams: ['name', 'email'],
            exclude: ['password'],
            hooks: { /* ... */ }
        },
        update: {
            enabled: true,
            allowedParams: ['name', 'bio'],
            skipMissingProperties: true  // 부분 수정 시 유용
        },
        destroy: {
            softDelete: true  // 소프트 삭제 사용
        },
        recover: {
            enabled: true     // 복구 엔드포인트 활성화
        }
    },
    
    logging: false  // SQL 로깅 비활성화
})
```

## 보안 주의사항

```typescript
// ❌ 잘못된 사용 - 모든 필드 노출 위험
@Crud({
    entity: User
    // allowedParams 미설정 시 아무 필드도 수정 불가
})

// ✅ 올바른 사용 - 명시적 필드 허용
@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'bio'],      // 수정 가능 필드만
    allowedFilters: ['status', 'role', 'email'],  // 필터 가능 필드만
    exclude: ['password', 'salt', 'refreshToken'] // 응답에서 제외
})
```

## 실제 API 호출 예시

### 사용자 목록 조회
```bash
# 활성 사용자 20명, 최신 가입순
curl "http://localhost:3000/users?filter[status_eq]=active&page[limit]=20&sort=-created_at"
```

### 사용자 생성
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "홍길동", "email": "hong@example.com", "bio": "개발자"}'
```

### 사용자 수정
```bash
curl -X PATCH http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"bio": "시니어 개발자"}'
```

### 복잡한 필터링
```bash
# 18세 이상, Gmail 사용자, 이름에 'John' 포함
curl "http://localhost:3000/users?\
filter[age_gte]=18&\
filter[email_like]=%@gmail.com&\
filter[name_contains]=John&\
include=profile,posts&\
sort=name&\
page[number]=1&page[size]=10"
```

## 성능 최적화 팁

### 1. Transform 최적화
```typescript
// CrudOperationHelper의 최적화된 메서드 사용
const response = await this.crudHelper.createWithResponse(data, {
    responseOptions: { 
        excludedFields: ['password'],
        skipTransform: true  // 98.9% 성능 향상
    }
});
```

### 2. 관계 로딩 주의
```typescript
// ❌ N+1 쿼리 발생 가능
@Crud({
    entity: User,
    allowedIncludes: ['posts', 'comments', 'likes']  // 너무 많은 관계
})

// ✅ 필요한 관계만 선택적 로딩
GET /users?include=posts  // 필요한 관계만 명시적 요청
```

### 3. 페이지네이션 활용
```typescript
// ❌ 전체 데이터 조회
GET /users

// ✅ 적절한 페이지 크기 설정
GET /users?page[limit]=20
```

## 일반적인 문제 해결

### 1. 필터가 작동하지 않을 때
- `allowedFilters`에 필터링할 필드가 포함되어 있는지 확인
- 필터 형식이 `field_operator` 패턴인지 확인 (예: `name_like`, `age_gt`)

### 2. 관계가 로드되지 않을 때
- `allowedIncludes`에 관계가 포함되어 있는지 확인
- Entity에 관계가 올바르게 정의되어 있는지 확인

### 3. 수정/생성 시 필드가 저장되지 않을 때
- `allowedParams`에 해당 필드가 포함되어 있는지 확인
- Entity의 validation 데코레이터 확인

### 4. 응답에 민감한 정보가 노출될 때
- `exclude` 옵션에 제외할 필드 추가
- Entity에서 `@Exclude()` 데코레이터 사용