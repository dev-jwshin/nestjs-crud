# @foryourdev/nestjs-crud v0.2.6 - 완전한 사용 가이드

이 패키지는 NestJS와 TypeORM 기반으로 RESTful CRUD API를 자동 생성하는 라이브러리입니다. 21개의 고급 편의 기능과 성능 최적화 도구를 포함하여 엔터프라이즈급 애플리케이션 개발을 지원합니다.

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

# 지원 연산자 (총 19개)
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
_fts      # PostgreSQL 전문 검색 (Full-Text Search)
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

### PostgreSQL 전문 검색 (Full-Text Search)

PostgreSQL 데이터베이스를 사용하는 경우, GIN 인덱스와 `to_tsvector`/`plainto_tsquery` 함수를 활용한 고성능 전문 검색을 사용할 수 있습니다.

```bash
# 전문 검색 사용
GET /posts?filter[title_fts]=개발자 커뮤니티
GET /products?filter[description_fts]=노트북 컴퓨터

# 다른 필터와 함께 사용
GET /posts?filter[title_fts]=NestJS&filter[status_eq]=published
```

#### GIN 인덱스 생성 (권장)

전문 검색 성능을 최적화하려면 GIN 인덱스를 생성하세요:

```sql
-- 기본 한국어 설정
CREATE INDEX CONCURRENTLY idx_posts_title_fts 
ON posts USING GIN (to_tsvector('korean', title));

-- 영어 설정
CREATE INDEX CONCURRENTLY idx_posts_description_fts 
ON posts USING GIN (to_tsvector('english', description));
```

#### GIN 인덱스 생성 가이드

```sql
-- 한국어 전문 검색을 위한 GIN 인덱스 생성
-- CONCURRENTLY 옵션으로 테이블 락 없이 인덱스 생성
CREATE INDEX CONCURRENTLY idx_posts_title_fts 
ON posts USING GIN (to_tsvector('korean', title));

-- 복합 필드 인덱스 (제목과 내용 동시 검색)
CREATE INDEX CONCURRENTLY idx_posts_content_fts 
ON posts USING GIN (
    to_tsvector('korean', coalesce(title, '') || ' ' || coalesce(content, ''))
);
```

#### 주의사항

- `_fts` 연산자는 **PostgreSQL 전용**입니다
- 다른 데이터베이스(MySQL, SQLite 등)에서 사용 시 에러가 발생합니다
- 성능 최적화를 위해 GIN 인덱스 생성을 강력히 권장합니다
- **보안**: 입력값은 TypeORM의 파라미터 바인딩을 통해 자동으로 이스케이프되어 SQL 인젝션으로부터 안전합니다

## 최신 업데이트 (v0.2.6)

### 주요 변경사항
- **21개 고급 편의 기능 추가**: 체이닝 데코레이터, 타입 안전 쿼리 빌더, 다층 캐싱, CLI 도구, IDE 확장 등
- **성능 최적화**: 스마트 배치 처리, 진행 상황 추적, 쿼리 성능 분석
- **개발 도구**: VS Code 확장, IntelliJ 플러그인, 자동 테스트 생성, 디버깅 도구
- **응답 형식 변환**: JSON:API, HAL, OData, GraphQL 형식 지원
- **PostgreSQL 전문 검색**: GIN 인덱스 기반 고성능 전문 검색 지원 (v0.2.6)

## 🎯 체이닝 가능한 설정 데코레이터

메서드 체이닝으로 CRUD 옵션을 유연하게 설정할 수 있습니다.

```typescript
@CrudConfig()
    .entity(User)
    .allowParams(['name', 'email', 'bio'])
    .excludeFields(['password'])
    .enableSoftDelete()
    .withPagination({ limit: 20, type: 'cursor' })
    .withCache({ ttl: 300 })
    .apply()
export class UserController {
    constructor(public readonly crudService: UserService) {}
}
```

## 🔄 조건부 설정 데코레이터

환경이나 조건에 따라 동적으로 CRUD 설정을 변경할 수 있습니다.

```typescript
@ConditionalCrud({
    condition: () => process.env.NODE_ENV === 'development',
    config: {
        logging: true,
        allowedFilters: ['*'], // 개발 환경에서는 모든 필터 허용
        exclude: []
    },
    fallback: {
        logging: false,
        allowedFilters: ['name', 'email', 'status'],
        exclude: ['password', 'salt']
    }
})
export class UserController {}
```

## 🛠️ 타입 안전 쿼리 빌더

TypeScript의 타입 시스템을 활용한 완전한 타입 안전성을 제공합니다.

```typescript
import { TypeSafeQueryBuilder } from '@foryourdev/nestjs-crud';

// 타입 안전한 쿼리 빌더
const query = new TypeSafeQueryBuilder<User>()
    .select('name', 'email')  // 타입 검증됨
    .where('status', 'eq', 'active')
    .andWhere('age', 'gte', 18)
    .orderBy('createdAt', 'DESC')
    .limit(20);

// 자동 완성과 타입 검증
const users = await this.userService.findWithBuilder(query);
```

## 📊 스마트 배치 처리

대용량 데이터 처리를 위한 지능형 배치 시스템입니다.

```typescript
import { SmartBatchProcessor } from '@foryourdev/nestjs-crud';

@Injectable()
export class UserService extends CrudService<User> {
    async bulkCreate(users: CreateUserDto[]) {
        const processor = new SmartBatchProcessor(this.repository);
        
        return await processor
            .setBatchSize(100)  // 자동 최적화
            .setRetryPolicy({ maxRetries: 3, backoff: 'exponential' })
            .enableProgressTracking()
            .process(users, 'create');
    }
}
```

## 🏃‍♂️ 진행 상황 추적

실시간으로 작업 진행 상황을 모니터링할 수 있습니다.

```typescript
import { ProgressTracker } from '@foryourdev/nestjs-crud';

@Get('/bulk-import/progress')
@Sse()
async getBulkImportProgress(@Query('taskId') taskId: string) {
    return ProgressTracker.getProgressStream(taskId);
}

// 클라이언트에서 실시간 진행 상황 수신
const eventSource = new EventSource('/api/bulk-import/progress?taskId=123');
eventSource.onmessage = (event) => {
    const progress = JSON.parse(event.data);
    console.log(`진행률: ${progress.percentage}%`);
};
```

## 🚀 다층 캐싱 시스템

메모리, Redis, 데이터베이스 레벨의 지능형 캐싱 시스템입니다.

```typescript
import { MultiTierCache } from '@foryourdev/nestjs-crud';

@Crud({
    entity: User,
    cache: {
        enabled: true,
        strategy: 'multi-tier',
        memory: { ttl: 60, max: 1000 },
        redis: { ttl: 300, keyPrefix: 'user:' },
        database: { ttl: 3600, table: 'query_cache' }
    }
})
export class UserController {}

// 수동 캐시 제어
const cache = new MultiTierCache<User>();
await cache.set('users:active', activeUsers, { ttl: 300 });
const cached = await cache.get('users:active');
```

## 📈 쿼리 성능 분석

쿼리 성능을 자동으로 분석하고 최적화 제안을 제공합니다.

```typescript
import { QueryPerformanceAnalyzer, IndexSuggestionEngine } from '@foryourdev/nestjs-crud';

@Injectable()
export class PerformanceService {
    async analyzeQueries() {
        const analyzer = new QueryPerformanceAnalyzer();
        const analysis = await analyzer.analyzeSlowQueries({
            threshold: 1000, // 1초 이상 쿼리
            timeframe: '24h'
        });
        
        const suggestions = IndexSuggestionEngine.generateSuggestions(analysis);
        console.log('인덱스 제안:', suggestions);
        
        return {
            slowQueries: analysis.queries,
            indexSuggestions: suggestions,
            optimizationTips: analysis.recommendations
        };
    }
}
```

## 🔧 CLI 도구

코드 생성과 마이그레이션을 위한 강력한 CLI 도구를 제공합니다.

```bash
# CRUD 생성
npx nestjs-crud generate crud --entity User --path ./src/users

# Entity 생성
npx nestjs-crud generate entity --name Product --fields "name:string,price:number,category:relation"

# 마이그레이션 생성
npx nestjs-crud migration generate --name AddUserIndexes --auto-index

# 문서 생성
npx nestjs-crud docs generate --output ./docs --format swagger

# 성능 분석
npx nestjs-crud analyze performance --connection default --output report.json
```

## 🎨 IDE 확장

### VS Code 확장

```json
// settings.json
{
    "nestjs-crud.autoImport": true,
    "nestjs-crud.generateTests": true,
    "nestjs-crud.defaultDatabase": "mysql",
    "nestjs-crud.outputPath": "./src"
}
```

### 사용 가능한 명령어
- `NestJS CRUD: Generate CRUD` - 완전한 CRUD 생성
- `NestJS CRUD: Generate Entity` - 엔티티 생성
- `NestJS CRUD: Generate DTO` - DTO 생성
- `NestJS CRUD: Analyze Performance` - 성능 분석
- `NestJS CRUD: Generate Documentation` - 문서 생성

## 🔄 추가 고급 유틸리티

### CrudConditionalHelper - 조건부 필드 처리

동적으로 필드를 포함하거나 제외할 수 있습니다.

```typescript
import { CrudConditionalHelper } from '@foryourdev/nestjs-crud';

const helper = new CrudConditionalHelper();

// 사용자 권한에 따른 필드 제어
const fields = helper.processFields(user, {
    conditions: [
        { when: (u) => u.role === 'admin', include: ['salary', 'ssn'] },
        { when: (u) => u.role === 'user', exclude: ['salary', 'ssn', 'internalNotes'] }
    ]
});
```

### LazyRelationLoader - 지연 관계 로딩

필요할 때만 관계를 로드하여 성능을 최적화합니다.

```typescript
import { LazyRelationLoader } from '@foryourdev/nestjs-crud';

@Injectable()
export class UserService extends CrudService<User> {
    private lazyLoader: LazyRelationLoader<User>;
    
    async getUserWithLazyRelations(id: number) {
        const user = await this.findOne(id);
        
        // 필요한 경우에만 관계 로드
        if (shouldLoadPosts) {
            await this.lazyLoader.load(user, ['posts']);
        }
        
        return user;
    }
}
```

### ChangeDetector - 변경 감지 시스템

엔티티의 변경 사항을 추적하고 감지합니다.

```typescript
import { ChangeDetector } from '@foryourdev/nestjs-crud';

const detector = new ChangeDetector();

// 변경 사항 감지
const changes = detector.detectChanges(originalEntity, updatedEntity);
console.log('변경된 필드:', changes.changedFields);
console.log('변경 이력:', changes.history);

// 변경 사항 적용 여부 결정
if (changes.hasSignificantChanges()) {
    await this.repository.save(updatedEntity);
}
```

### ConditionalFieldProcessor - 조건부 필드 프로세서

비즈니스 로직에 따라 필드를 동적으로 처리합니다.

```typescript
import { ConditionalFieldProcessor } from '@foryourdev/nestjs-crud';

const processor = new ConditionalFieldProcessor();

// 조건부 필드 처리
const processed = processor.process(entity, {
    rules: [
        { field: 'discount', condition: (e) => e.vip === true, transform: (v) => v * 1.5 },
        { field: 'price', condition: (e) => e.bulk === true, transform: (v) => v * 0.8 }
    ]
});
```

## 🧪 자동 테스트 생성

E2E 및 단위 테스트를 자동으로 생성합니다.

```typescript
import { TestGenerator } from '@foryourdev/nestjs-crud';

const generator = new TestGenerator();

// E2E 테스트 생성
await generator.generateE2ETests({
    entity: User,
    endpoints: ['create', 'read', 'update', 'delete'],
    scenarios: ['success', 'validation', 'authorization'],
    outputPath: './test/e2e'
});

// 단위 테스트 생성
await generator.generateUnitTests({
    service: UserService,
    methods: ['create', 'findOne', 'update', 'remove'],
    mockStrategy: 'auto',
    outputPath: './test/unit'
});
```

## 🔍 디버깅 도구

개발 중 디버깅을 위한 유용한 도구들을 제공합니다.

```typescript
import { DebugTools } from '@foryourdev/nestjs-crud';

// 쿼리 로깅 및 성능 측정
DebugTools.enableQueryLogging({
    slowQueryThreshold: 1000,
    logLevel: 'verbose',
    includeStackTrace: true
});

// 메모리 사용량 모니터링
DebugTools.enableMemoryMonitoring({
    interval: 5000,
    alertThreshold: '500MB'
});

// API 요청 추적
DebugTools.enableRequestTracing({
    includeHeaders: true,
    includeBody: true,
    sensitiveFields: ['password', 'token']
});
```

## 🎭 응답 형식 변환

다양한 API 표준 형식으로 응답을 변환할 수 있습니다.

```typescript
import { ResponseTransformer } from '@foryourdev/nestjs-crud';

// JSON:API 형식
@Get()
async getUsers(@Req() req: Request) {
    const users = await this.userService.findMany(req);
    return ResponseTransformer.toJsonApi(users, {
        type: 'users',
        baseUrl: 'http://localhost:3000/api'
    });
}

// HAL 형식
@Get(':id')
async getUser(@Param('id') id: number) {
    const user = await this.userService.findOne(id);
    return ResponseTransformer.toHal(user, {
        links: {
            self: `/users/${id}`,
            posts: `/users/${id}/posts`
        }
    });
}

// OData 형식
@Get()
async getUsersOData(@Req() req: Request) {
    const result = await this.userService.findMany(req);
    return ResponseTransformer.toOData(result);
}

// GraphQL 형식
@Get('/graphql-format')
async getUsersGraphQL(@Req() req: Request) {
    const users = await this.userService.findMany(req);
    return ResponseTransformer.toGraphQL(users, {
        operationName: 'GetUsers',
        fields: ['id', 'name', 'email', 'posts { id, title }']
    });
}
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

## 🔐 보안 주의사항

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

### PostgreSQL 전문 검색
```bash
# 제목에서 "NestJS 개발" 전문 검색 (PostgreSQL 전용)
curl "http://localhost:3000/posts?filter[title_fts]=NestJS 개발"

# 전문 검색과 일반 필터 조합
curl "http://localhost:3000/posts?\
filter[content_fts]=TypeScript 마이크로서비스&\
filter[status_eq]=published&\
filter[created_at_gte]=2024-01-01&\
sort=-created_at&\
page[limit]=10"
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

### 2. 스마트 배치 처리 활용
```typescript
// 대용량 데이터 처리 시 SmartBatchProcessor 사용
const processor = new SmartBatchProcessor(this.repository);
await processor.setBatchSize(100).process(largeDataSet, 'create');
```

### 3. 다층 캐싱 활용
```typescript
// 자주 조회되는 데이터는 캐싱 활용
@Crud({
    entity: User,
    cache: {
        enabled: true,
        strategy: 'multi-tier',
        memory: { ttl: 60 },
        redis: { ttl: 300 }
    }
})
```

### 4. 관계 로딩 최적화
```typescript
// ❌ N+1 쿼리 발생 가능
@Crud({
    entity: User,
    allowedIncludes: ['posts', 'comments', 'likes']  // 너무 많은 관계
})

// ✅ 지연 로딩과 자동 관계 감지 활용
@Crud({
    entity: User,
    allowedIncludes: ['posts'],  // 필요한 관계만
    lazyLoading: true,           // 지연 로딩 활성화
    autoRelationDetection: true  // 자동 관계 감지
})
```

### 5. PostgreSQL 전문 검색 최적화
```sql
-- ✅ GIN 인덱스 생성으로 전문 검색 성능 향상
CREATE INDEX CONCURRENTLY idx_posts_title_fts 
ON posts USING GIN (to_tsvector('korean', title));

-- ✅ 복합 GIN 인덱스로 여러 필드 동시 검색
CREATE INDEX CONCURRENTLY idx_posts_content_fts 
ON posts USING GIN (
    to_tsvector('korean', coalesce(title, '') || ' ' || coalesce(content, ''))
);
```

```typescript
// ✅ TypeORM 마이그레이션으로 인덱스 생성
export class AddFullTextSearchIndexes1234567890 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX CONCURRENTLY idx_posts_title_fts 
            ON posts USING GIN (to_tsvector('korean', title))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX idx_posts_title_fts`);
    }
}
```

## 📝 v0.2.6 마이그레이션 가이드

### 인터페이스 이름 변경
일부 인터페이스 이름이 충돌 방지를 위해 변경되었습니다:

```typescript
// 이전 (v0.2.5)
import { PaginationOptions } from '@foryourdev/nestjs-crud';

// 이후 (v0.2.6)
import { CrudQueryPaginationOptions } from '@foryourdev/nestjs-crud';
```

영향받는 인터페이스:
- `PaginationOptions` → `CrudQueryPaginationOptions`
- 대부분의 경우 타입 추론으로 자동 처리되므로 코드 변경이 필요하지 않습니다

## 일반적인 문제 해결

### 1. 필터가 작동하지 않을 때
- `allowedFilters`에 필터링할 필드가 포함되어 있는지 확인
- 필터 형식이 `field_operator` 패턴인지 확인 (예: `name_like`, `age_gt`)

### 2. 관계가 로드되지 않을 때
- `allowedIncludes`에 관계가 포함되어 있는지 확인
- Entity에 관계가 올바르게 정의되어 있는지 확인
- `AutoRelationDetector`를 사용하여 자동 감지 활성화

### 3. 수정/생성 시 필드가 저장되지 않을 때
- `allowedParams`에 해당 필드가 포함되어 있는지 확인
- Entity의 validation 데코레이터 확인

### 4. 성능 문제가 발생할 때
- `QueryPerformanceAnalyzer`를 사용하여 느린 쿼리 분석
- `IndexSuggestionEngine`으로 인덱스 최적화 제안 확인
- 다층 캐싱 활성화 고려

### 5. 응답에 민감한 정보가 노출될 때
- `exclude` 옵션에 제외할 필드 추가
- Entity에서 `@Exclude()` 데코레이터 사용

### 6. PostgreSQL 전문 검색 문제가 발생할 때
- **에러**: "Full-text search (_fts) operator is only supported with PostgreSQL"
  - PostgreSQL 데이터베이스를 사용하고 있는지 확인
  - MySQL, SQLite 등에서는 `_fts` 연산자 대신 `_like` 또는 `_contains` 사용
- **느린 전문 검색 성능**
  - GIN 인덱스가 생성되어 있는지 확인
  - `QueryConverter.generateGinIndexSQL()` 메서드로 인덱스 생성 SQL 확인
- **한국어 검색 결과 부정확**
  - `to_tsvector('korean', ...)` 설정 확인
  - PostgreSQL의 한국어 사전 설정 확인

---

## 🚀 프로젝트에서 Claude Code에게 전달할 프롬프트

프로젝트에서 이 패키지를 사용할 때 Claude Code에게 다음과 같이 안내하세요:

---

**이 프로젝트는 @foryourdev/nestjs-crud v0.2.6 패키지를 사용합니다.** 

이 패키지는 NestJS와 TypeORM 기반의 자동 CRUD API 생성 라이브러리로, 21개의 고급 편의 기능을 포함합니다:

**🎯 핵심 기능:**
- `@Crud` 데코레이터로 7개 엔드포인트 자동 생성 (GET, POST, PUT, PATCH, DELETE, 복구)
- 벌크 작업 지원 (배열 기반 생성/수정/삭제)
- 19개 필터 연산자, 3가지 페이지네이션 방식
- PostgreSQL 전문 검색 (`_fts`) - GIN 인덱스와 to_tsvector/plainto_tsquery 지원
- 생명주기 훅 (`@BeforeCreate`, `@AfterUpdate` 등)
- 소프트 삭제 및 복구 기능

**🚀 고급 기능 (v0.2.6):**
- **체이닝 데코레이터**: `@CrudConfig().entity(User).allowParams(['name']).apply()`
- **조건부 설정**: 환경별 동적 CRUD 설정
- **타입 안전 쿼리 빌더**: `TypeSafeQueryBuilder<User>()` 완전한 타입 검증
- **스마트 배치 처리**: `SmartBatchProcessor` 대용량 데이터 최적화
- **진행 상황 추적**: `ProgressTracker` 실시간 SSE 모니터링
- **다층 캐싱**: 메모리/Redis/DB 지능형 캐시
- **성능 분석**: `QueryPerformanceAnalyzer`, `IndexSuggestionEngine`
- **응답 변환**: JSON:API, HAL, OData, GraphQL 형식 지원
- **CLI 도구**: 코드 생성, 마이그레이션, 문서화
- **IDE 확장**: VS Code/IntelliJ 플러그인
- **자동 테스트 생성**: E2E/단위 테스트 자동 생성
- **디버깅 도구**: `DebugTools` 쿼리/메모리 모니터링

**🛠️ 개발 시 고려사항:**
- **보안**: `allowedParams`, `allowedFilters`, `exclude` 필드 반드시 설정
- **성능**: `skipTransform: true` 사용 시 98.9% 성능 향상
- **타입 안전성**: TypeScript 타입 활용한 완전한 타입 검증
- **확장성**: `CrudQueryHelper`, `CrudOperationHelper`로 커스텀 라우트 지원

**코드 작성 시:**
1. Entity에 적절한 validation 데코레이터 추가
2. `@Crud` 데코레이터에서 보안 필드 설정 필수
3. 대용량 처리 시 `SmartBatchProcessor` 활용
4. 성능 최적화가 필요한 경우 다층 캐싱 고려
5. CLI 도구를 활용한 코드 생성 권장

이 정보를 바탕으로 NestJS CRUD 개발을 도와주세요.

---