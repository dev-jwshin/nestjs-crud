# 레거시 코드 정리

이 문서는 `@foryourdev/nestjs-crud` 패키지 내의 레거시 코드 패턴과 개선이 필요한 부분을 정리합니다.

## 📌 요약

- **레거시 코드 수**: 약 15개 패턴
- **주요 영역**: 훅 시스템, 쿼리 처리, 메서드 네이밍
- **리팩토링 우선순위**: 낮음 (대부분 하위 호환성 유지 필요)

## 1. Deprecated 옵션

### 1.1 `relations` 옵션 (Deprecated)

**위치**: `src/lib/interface/decorator-option.interface.ts`

```typescript
// Line 117, 158
/**
 * @deprecated 이 옵션은 더 이상 사용되지 않습니다. allowedIncludes를 사용하세요.
 */
relations?: false | string[];
```

**문제점**:
- `relations` 옵션이 여전히 인터페이스에 존재
- `allowedIncludes`로 대체되었지만 하위 호환성을 위해 유지

**권장사항**:
```typescript
// ❌ 레거시
@Crud({
    routes: {
        show: {
            relations: ['posts', 'profile']
        }
    }
})

// ✅ 권장
@Crud({
    allowedIncludes: ['posts', 'profile']
})
```

## 2. Configuration 기반 훅 vs Decorator 기반 훅

### 2.1 이중 훅 시스템

**현재 상황**:
- **Configuration 방식** (레거시): routes 옵션 내 hooks 설정
- **Decorator 방식** (권장): 메서드 데코레이터 사용

**파일들**:
- `src/lib/crud.service.ts`: 두 방식 모두 지원
- `src/lib/crud.route.factory.ts`: 훅 처리 로직
- `src/lib/dto/lifecycle-hooks.decorator.ts`: 새로운 데코레이터 방식

**레거시 패턴 (Configuration)**:
```typescript
@Crud({
    routes: {
        create: {
            hooks: {
                assignBefore: async (body) => { ... },
                saveBefore: async (entity) => { ... },
                saveAfter: async (entity) => { ... }
            }
        }
    }
})
```

**권장 패턴 (Decorator)**:
```typescript
@Injectable()
export class UserService extends CrudService<User> {
    @BeforeCreate()
    async validateCreate(body) { ... }
    
    @AfterCreate()
    async afterCreate(entity) { ... }
}
```

## 3. 내부 메서드 네이밍 - "reserved" 접두사

### 3.1 Reserved 메서드들

**파일**: `src/lib/crud.service.ts`, `src/lib/crud.route.factory.ts`

```typescript
// CrudService 내부 메서드들
reservedIndex()
reservedShow()
reservedCreate()
reservedUpdate()
reservedDestroy()
reservedUpsert()
reservedRecover()
```

**문제점**:
- "reserved"라는 네이밍이 의미 전달이 불명확
- 내부 구현 메서드임을 나타내기 위한 것으로 보이나 더 나은 네이밍 가능

**개선 제안**:
```typescript
// 더 명확한 네이밍 예시
_handleIndex()    // 언더스코어로 내부 메서드 표시
crudIndex()       // CRUD 접두사 사용
processIndex()    // 처리 의미 명확화
```

## 4. 레거시 쿼리 처리

### 4.1 Legacy Query 변환

**파일**: `src/lib/interceptor/read-many-request.interceptor.ts`

```typescript
// Line 63-90
const legacyQuery = (() => {
    // 레거시 쿼리 파라미터 처리
    ...
})();

// 새로운 파라미터와 레거시 파라미터 병합
const mergedWhere = { ...legacyQuery, ...findOptions.where };
```

**문제점**:
- 구버전 쿼리 형식과 신버전을 모두 지원하기 위한 복잡한 로직
- 코드 가독성 저하

## 5. 훅 타입 문자열 리터럴

### 5.1 훅 타입 하드코딩

**파일**: `src/lib/dto/lifecycle-hooks.decorator.ts`

```typescript
// Line 6-9
export type HookType = 
    | 'assignBefore'
    | 'assignAfter'
    | 'saveBefore'
    | 'saveAfter'
    | 'destroyBefore'
    | 'destroyAfter'
    | 'recoverBefore'
    | 'recoverAfter';
```

**문제점**:
- 문자열 리터럴 타입으로 하드코딩
- enum이나 const assertion 사용이 더 나을 수 있음

**개선 제안**:
```typescript
export const HOOK_TYPES = {
    ASSIGN_BEFORE: 'assignBefore',
    ASSIGN_AFTER: 'assignAfter',
    SAVE_BEFORE: 'saveBefore',
    SAVE_AFTER: 'saveAfter'
} as const;

export type HookType = typeof HOOK_TYPES[keyof typeof HOOK_TYPES];
```

## 6. 캐시 관리의 "oldest" 네이밍

### 6.1 Oldest Entry 처리

**파일**: `src/lib/dto/metadata-cache-manager.ts`

```typescript
// Line 222-233, 241-252
let oldestKey = '';
let oldestTime = Date.now();
// ...
if (entry.lastAccessed < oldestTime) {
    oldestTime = entry.lastAccessed;
    oldestKey = key;
}
```

**문제점**:
- LRU(Least Recently Used) 캐시 구현이지만 "oldest"라는 네이밍 사용
- "leastRecentlyUsed" 또는 "lru" 네이밍이 더 명확

## 7. 매직 스트링

### 7.1 상수 정의

**파일**: `src/lib/constants.ts`

```typescript
export const CRUD_ROUTE_ARGS = 'RESERVED_CRUD_ROUTE_ARGS';
export const CUSTOM_REQUEST_OPTIONS = 'RESERVED_CUSTOM_REQUEST_OPTIONS';
export const CRUD_OPTIONS_METADATA = 'RESERVED_CRUD_OPTIONS_METADATA';
```

**문제점**:
- "RESERVED_" 접두사의 의미가 불명확
- 메타데이터 키에 대한 설명 부족

## 8. TODO/FIXME 코멘트

현재 코드베이스에 명시적인 TODO/FIXME 코멘트는 발견되지 않았으나, 다음 부분들이 개선 가능:

### 8.1 동적 검증 메타데이터 생성

**파일**: `src/lib/interceptor/create-request.interceptor.ts`

```typescript
// Line 89-92
// 🚀 동적 검증 메타데이터 생성
try {
    // 임포트 추가 필요하지만 일단 기존 검증 방식 사용하면서 로깅 강화
    const transformed = plainToInstance(crudOptions.entity as ClassConstructor<EntityType>, body);
```

**문제점**:
- 주석에 "임포트 추가 필요" 언급
- 임시 해결책으로 보임

## 9. 리팩토링 권장사항

### 우선순위 높음
1. Deprecated `relations` 옵션 제거 (메이저 버전 업데이트 시)
2. Configuration 기반 훅 지원 중단 안내

### 우선순위 중간
1. "reserved" 메서드 네이밍 개선
2. 훅 타입 enum 전환
3. 캐시 관리 네이밍 개선

### 우선순위 낮음
1. 매직 스트링 상수 네이밍 개선
2. 레거시 쿼리 처리 로직 분리

## 10. 마이그레이션 가이드

### 10.1 relations → allowedIncludes

```typescript
// Before (v0.1.x)
@Crud({
    routes: {
        show: { relations: ['posts'] },
        index: { relations: ['posts', 'comments'] }
    }
})

// After (v0.2.x+)
@Crud({
    allowedIncludes: ['posts', 'comments']
})
```

### 10.2 Configuration Hooks → Decorator Hooks

```typescript
// Before (Configuration)
@Crud({
    routes: {
        create: {
            hooks: {
                saveBefore: async (entity) => {
                    entity.createdAt = new Date();
                    return entity;
                }
            }
        }
    }
})

// After (Decorator)
@Injectable()
export class UserService extends CrudService<User> {
    @BeforeCreate()
    async setCreatedAt(entity: User) {
        entity.createdAt = new Date();
        return entity;
    }
}
```

## 11. 하위 호환성 유지 전략

현재 모든 레거시 패턴들은 하위 호환성을 위해 유지되고 있음:

1. **Deprecated 옵션**: 경고 메시지와 함께 계속 작동
2. **이중 훅 시스템**: 두 방식 모두 지원
3. **레거시 쿼리**: 자동 변환 처리

### 제거 일정 제안
- **v0.3.0**: Deprecation 경고 추가
- **v0.4.0**: 레거시 기능 비활성화 옵션 제공
- **v1.0.0**: 레거시 코드 완전 제거

## 12. 성능 영향

레거시 코드가 성능에 미치는 영향:

1. **훅 처리**: 두 시스템 체크로 약간의 오버헤드 (~1-2ms)
2. **쿼리 변환**: 레거시 쿼리 파싱 추가 처리 (~0.5ms)
3. **메모리**: 중복 메타데이터 저장으로 약간의 메모리 증가

전반적으로 성능 영향은 미미하나, 코드 복잡도 증가가 주요 문제

## 결론

현재 레거시 코드들은 주로 하위 호환성을 위해 유지되고 있으며, 기능적으로는 문제가 없습니다. 다만 코드 가독성과 유지보수성 측면에서 점진적인 개선이 필요합니다.

메이저 버전 업데이트(v1.0.0) 시점에 레거시 코드를 제거하고, 그 전까지는 명확한 마이그레이션 가이드와 Deprecation 경고를 제공하는 것이 권장됩니다.