# CrudOperationHelper 사용 가이드

## 개요

`CrudOperationHelper`는 route를 오버라이드할 때도 CRUD의 핵심 기능들을 사용할 수 있게 해주는 헬퍼 클래스입니다.

## 해결하는 문제

route를 오버라이드하면 다음과 같은 CRUD 기능들을 사용할 수 없게 됩니다:
- Entity validation (class-validator decorators)
- Allowed params filtering
- Field exclusion
- Lifecycle hooks

`CrudOperationHelper`를 사용하면 이 모든 기능을 그대로 사용할 수 있습니다.

## 주요 기능

### 1. Entity Validation
class-validator의 데코레이터를 자동으로 실행합니다.

```typescript
// Entity
@Entity()
class User {
    @IsString()
    @MinLength(2)
    name: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;
}

// Controller
const validatedData = await this.crudHelper.validateEntity(data);
```

### 2. Allowed Params Filtering
허용된 필드만 자동으로 필터링합니다.

```typescript
const filteredData = this.crudHelper.filterAllowedParams(
    data, 
    'create',  // operation type
    ['name', 'email', 'password'] // allowed fields
);
```

### 3. Field Exclusion
응답에서 특정 필드를 제외합니다.

```typescript
const result = this.crudHelper.excludeFields(
    entity,
    'create',
    ['password', 'internalId'] // fields to exclude
);
```

### 4. Lifecycle Hooks
CRUD의 생명주기 훅을 실행합니다.

```typescript
await this.crudHelper.create(data, {
    hooks: {
        assignBefore: async (data, context) => {
            // 데이터 할당 전 처리
            data.status = 'pending';
            return data;
        },
        saveBefore: async (entity, context) => {
            // 저장 전 처리
            entity.password = await hashPassword(entity.password);
            return entity;
        },
        saveAfter: async (entity, context) => {
            // 저장 후 처리
            await sendWelcomeEmail(entity.email);
            return entity;
        }
    }
});
```

## 사용법

### 기본 설정

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Crud, CrudService, CrudOperationHelper } from 'nestjs-crud';

@Controller('users')
@Crud({
    entity: User,
    allowedParams: ['name', 'email', 'password'],
    exclude: ['password'],
})
export class UserController {
    private crudHelper: CrudOperationHelper<User>;

    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {
        // CrudOperationHelper 초기화
        this.crudHelper = new CrudOperationHelper(
            userRepository,
            {
                entity: User,
                allowedParams: ['name', 'email', 'password'],
                exclude: ['password'],
            }
        );
    }
}
```

### CREATE 오버라이드

```typescript
@Post()
async create(@Body() body: any) {
    // CRUD의 모든 기능을 사용하여 생성
    return this.crudHelper.create(body, {
        validate: true,  // entity validation 실행
        allowedParams: ['name', 'email', 'password'],
        exclude: ['password'],
        hooks: {
            saveBefore: async (entity) => {
                // 비밀번호 해싱
                if (entity.password) {
                    entity.password = await bcrypt.hash(entity.password, 10);
                }
                return entity;
            },
            saveAfter: async (entity) => {
                // 환영 이메일 발송
                await this.emailService.sendWelcomeEmail(entity.email);
                return entity;
            }
        }
    });
}
```

### UPDATE 오버라이드

```typescript
@Patch(':id')
async update(@Param('id') id: number, @Body() body: any) {
    return this.crudHelper.update(id, body, {
        validate: true,  // partial update validation
        allowedParams: ['name', 'email', 'status'],
        exclude: ['password', 'id'],
        hooks: {
            saveBefore: async (entity, context) => {
                // 변경 이력 기록
                await this.auditService.logUpdate(entity.id, body);
                return entity;
            }
        }
    });
}
```

### Bulk Operations

```typescript
@Post('bulk')
async bulkCreate(@Body() users: any[]) {
    return this.crudHelper.bulkCreate(users, {
        validate: true,
        batchSize: 50,  // 50개씩 배치 처리
        hooks: {
            saveBefore: async (entity) => {
                entity.password = await bcrypt.hash(entity.password, 10);
                return entity;
            }
        },
        exclude: ['password']
    });
}

@Patch('bulk')
async bulkUpdate(@Body() updates: Array<{ id: number; [key: string]: any }>) {
    return this.crudHelper.bulkUpdate(updates, {
        validate: true,
        exclude: ['password'],
        batchSize: 50
    });
}
```

### 단계별 처리

```typescript
@Post()
async create(@Body() body: any) {
    // 1. Allowed params 필터링
    const filteredData = this.crudHelper.filterAllowedParams(body, 'create');
    
    // 2. Validation
    const validatedData = await this.crudHelper.validateEntity(filteredData);
    
    // 3. 비즈니스 로직
    if (validatedData.password) {
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
    }
    
    // 4. 저장
    const entity = await this.userRepository.save(validatedData);
    
    // 5. 필드 제외
    return this.crudHelper.excludeFields(entity, 'create');
}
```

### CrudQueryHelper와 함께 사용

```typescript
@Get()
async index(@Req() req: Request) {
    // 페이지네이션과 필터링 적용
    const qb = this.userRepository.createQueryBuilder('user');
    const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req);
    
    // 필드 제외 적용
    result.data = this.crudHelper.excludeFields(result.data, 'show');
    
    return result;
}
```

## 고급 사용법

### 커스텀 Validation 옵션

```typescript
const validatedData = await this.crudHelper.validateEntity(data, {
    skipMissingProperties: false,  // 모든 필드 필수
    whitelist: true,  // 정의되지 않은 필드 제거
    forbidNonWhitelisted: true,  // 정의되지 않은 필드 있으면 에러
    groups: ['create']  // validation 그룹 지정
});
```

### 조건부 Allowed Params

```typescript
@Post()
async create(@Body() body: any, @Req() req: Request) {
    const isAdmin = req.user?.role === 'admin';
    
    return this.crudHelper.create(body, {
        validate: true,
        // 관리자는 더 많은 필드 설정 가능
        allowedParams: isAdmin 
            ? ['name', 'email', 'password', 'role', 'status']
            : ['name', 'email', 'password'],
        exclude: ['password']
    });
}
```

### Request Body 처리

```typescript
@Post()
async create(@Req() req: Request) {
    // Request body를 한 번에 처리 (filtering + validation)
    const processedBody = await this.crudHelper.processRequestBody(
        req,
        'create',
        {
            allowedParams: ['name', 'email', 'password'],
            validate: true
        }
    );
    
    // 이미 필터링과 검증이 완료된 데이터
    return this.userRepository.save(processedBody);
}
```

### Entity Metadata 조회

```typescript
// Entity의 메타데이터 정보 조회
const metadata = this.crudHelper.getEntityMetadata();
console.log(metadata);
// {
//   tableName: 'user',
//   primaryKey: 'id',
//   columns: [...],
//   relations: [...]
// }
```

## API Reference

### Constructor
```typescript
new CrudOperationHelper<T>(
    repository: Repository<T>,
    crudOptions: CrudOptions
)
```

### Methods

#### `validateEntity(data, options?)`
Entity validation을 수행합니다.

#### `validateForUpdate(data, options?)`
UPDATE용 validation을 수행합니다 (partial update).

#### `filterAllowedParams(data, operation?, customAllowedParams?)`
허용된 필드만 필터링합니다.

#### `excludeFields(entity, operation?, customExclude?)`
지정된 필드를 제외합니다.

#### `create(data, options?)`
모든 CRUD 기능을 사용하여 엔티티를 생성합니다.

#### `update(id, data, options?)`
모든 CRUD 기능을 사용하여 엔티티를 수정합니다.

#### `bulkCreate(dataArray, options?)`
여러 엔티티를 한 번에 생성합니다.

#### `bulkUpdate(updates, options?)`
여러 엔티티를 한 번에 수정합니다.

#### `processRequestBody(req, operation, options?)`
Request body를 처리합니다 (filtering + validation).

#### `getEntityMetadata()`
Entity의 메타데이터를 반환합니다.

## 주의사항

1. **CrudOperationHelper는 Repository 인스턴스가 필요합니다**
   - Controller에서 Repository를 주입받아야 합니다.

2. **CrudOptions를 정확히 설정해야 합니다**
   - entity, allowedParams, exclude 등을 올바르게 설정하세요.

3. **Validation 에러 처리**
   - ValidationException이 발생할 수 있으므로 적절히 처리하세요.

4. **트랜잭션 처리**
   - 복잡한 작업은 트랜잭션으로 감싸는 것을 고려하세요.

## 마이그레이션 가이드

### 기존 오버라이드 코드
```typescript
@Post()
async create(@Body() body: any) {
    // 수동으로 validation
    if (!body.email || !body.name) {
        throw new BadRequestException('Missing required fields');
    }
    
    // 수동으로 필터링
    const allowedFields = ['name', 'email', 'password'];
    const filtered = {};
    for (const field of allowedFields) {
        if (body[field]) filtered[field] = body[field];
    }
    
    // 비즈니스 로직
    filtered.password = await bcrypt.hash(filtered.password, 10);
    
    // 저장
    const entity = await this.repository.save(filtered);
    
    // 수동으로 필드 제외
    delete entity.password;
    
    return entity;
}
```

### CrudOperationHelper 사용
```typescript
@Post()
async create(@Body() body: any) {
    return this.crudHelper.create(body, {
        validate: true,
        allowedParams: ['name', 'email', 'password'],
        hooks: {
            saveBefore: async (entity) => {
                entity.password = await bcrypt.hash(entity.password, 10);
                return entity;
            }
        },
        exclude: ['password']
    });
}
```

## 결론

`CrudOperationHelper`를 사용하면 route를 오버라이드하면서도 CRUD의 강력한 기능들을 그대로 활용할 수 있습니다. 코드 중복을 줄이고, 일관성 있는 API를 구현할 수 있습니다.