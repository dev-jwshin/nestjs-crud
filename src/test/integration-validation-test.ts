/**
 * 🧪 Entity 기반 DTO 생성 문제 해결 - 통합 테스트
 *
 * 테스트 케이스:
 * 1. allowedParams에 포함된 필드가 class-validator 데코레이터 없어도 DTO에 포함되는지
 * 2. Column default 값이 있어도 검증 오류가 발생하지 않는지
 * 3. 동적 검증 시스템이 정상 작동하는지
 * 4. 캐싱 시스템이 성능을 향상시키는지
 */

import { IsEmail, IsOptional, IsString } from 'class-validator';
import 'reflect-metadata';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// 테스트 대상 모듈들
import {
    clearValidationMetadataCache,
    CreateRequestDto,
    debugCacheStatus,
    generateDynamicValidationMetadata,
    getPropertyNamesFromMetadata,
} from '../lib/dto';
import { Method } from '../lib/interface';

// 🧪 테스트용 Enum
enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator',
}

enum Provider {
    LOCAL = 'local',
    GOOGLE = 'google',
    APPLE = 'apple',
    FACEBOOK = 'facebook',
}

// 🧪 문제가 되는 테스트 엔티티 (실제 문제 상황 재현)
@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    // ✅ 기존에 검증 데코레이터가 있는 필드
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

    // ❌ 문제 1: @IsString 같은 검증 데코레이터 없는 필드 (allowedParams에 포함되어야 함)
    @Column({ type: 'varchar', length: 20 })
    phone: string;

    @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
    role: UserRole;

    // ❌ 문제 2: default 값 있는데도 required로 검증되는 필드
    @Column({ type: 'enum', enum: Provider, default: Provider.LOCAL })
    provider: Provider;

    @Column({ nullable: true })
    refreshToken?: string;

    // ❌ 문제 3: nullable이지만 여전히 required로 검증되는 필드
    @Column({ type: 'varchar', length: 255, nullable: true })
    profileImage?: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;
}

// 🧪 테스트 실행 함수들

/**
 * 🔬 테스트 1: allowedParams 우선 보장 테스트
 */
function testAllowedParamsPriority() {
    console.log('\n🔬 === Test 1: allowedParams Priority Test ===');

    // allowedParams에 phone, role, provider가 포함되어야 함 (class-validator 데코레이터 없어도)
    const allowedParams = ['name', 'email', 'phone', 'role', 'provider', 'bio'];

    console.log('🎯 Testing allowedParams:', allowedParams);

    const metadata = generateDynamicValidationMetadata(TestUser, allowedParams, Method.CREATE);
    const propertyNames = getPropertyNamesFromMetadata(TestUser, Method.CREATE, allowedParams);

    console.log(
        '📋 Generated metadata fields:',
        metadata.map((m) => m.propertyName),
    );
    console.log('📋 Property names for DTO:', propertyNames);

    // 검증: allowedParams의 모든 필드가 포함되었는지 확인
    const missingFields = allowedParams.filter(
        (param) => !metadata.some((m) => m.propertyName === param) && !propertyNames.includes(param),
    );

    if (missingFields.length === 0) {
        console.log('✅ Test 1 PASSED: All allowedParams fields included');
    } else {
        console.log('❌ Test 1 FAILED: Missing fields:', missingFields);
    }

    // 세부 검증 결과
    allowedParams.forEach((param) => {
        const metadataExists = metadata.some((m) => m.propertyName === param);
        const propertyExists = propertyNames.includes(param);
        console.log(`   ${param}: metadata=${metadataExists ? '✅' : '❌'}, property=${propertyExists ? '✅' : '❌'}`);
    });
}

/**
 * 🔬 테스트 2: Column 옵션 기반 자동 검증 규칙 생성 테스트
 */
function testColumnBasedValidation() {
    console.log('\n🔬 === Test 2: Column-Based Validation Test ===');

    const allowedParams = ['phone', 'role', 'provider', 'refreshToken', 'profileImage'];
    const metadata = generateDynamicValidationMetadata(TestUser, allowedParams, Method.CREATE);

    console.log('📋 Testing column-based validation rules:');

    metadata.forEach((meta) => {
        if (allowedParams.includes(meta.propertyName)) {
            console.log(`   ${meta.propertyName}:`);
            console.log(`     - Optional: ${meta.isOptional ? '✅' : '❌'}`);
            console.log(`     - Rules: ${meta.rules.map((r) => `@${r.validator}`).join(', ')}`);

            // 검증: default나 nullable 필드는 optional이어야 함
            if (['role', 'provider', 'refreshToken', 'profileImage'].includes(meta.propertyName)) {
                if (meta.isOptional) {
                    console.log(`     ✅ Correctly marked as optional`);
                } else {
                    console.log(`     ❌ Should be optional (has default/nullable)`);
                }
            }
        }
    });
}

/**
 * 🔬 테스트 3: DTO 생성 테스트
 */
function testDtoGeneration() {
    console.log('\n🔬 === Test 3: DTO Generation Test ===');

    const allowedParams = ['name', 'email', 'phone', 'role', 'provider'];

    try {
        const CreateUserDto = CreateRequestDto(TestUser, Method.CREATE, allowedParams);
        console.log(`✅ DTO created successfully: ${CreateUserDto.name}`);

        // DTO 인스턴스 생성 테스트
        const dtoInstance = new CreateUserDto();
        console.log('✅ DTO instance created:', typeof dtoInstance);
    } catch (error) {
        console.log('❌ DTO creation failed:', error);
    }
}

/**
 * 🔬 테스트 4: 캐싱 성능 테스트
 */
function testCachingPerformance() {
    console.log('\n🔬 === Test 4: Caching Performance Test ===');

    const allowedParams = ['name', 'email', 'phone', 'role', 'provider'];

    // 첫 번째 호출 (캐시 생성)
    console.log('📊 First call (cache generation):');
    const start1 = performance.now();
    generateDynamicValidationMetadata(TestUser, allowedParams, Method.CREATE);
    const time1 = performance.now() - start1;
    console.log(`   Time: ${time1.toFixed(2)}ms`);

    // 두 번째 호출 (캐시 히트)
    console.log('📊 Second call (cache hit):');
    const start2 = performance.now();
    generateDynamicValidationMetadata(TestUser, allowedParams, Method.CREATE);
    const time2 = performance.now() - start2;
    console.log(`   Time: ${time2.toFixed(2)}ms`);

    // 성능 향상 계산
    if (time1 > time2) {
        const improvement = (((time1 - time2) / time1) * 100).toFixed(1);
        console.log(`✅ Cache performance improvement: ${improvement}%`);
    } else {
        console.log('⚠️ Cache might not be working effectively');
    }

    // 캐시 상태 출력
    debugCacheStatus();
}

/**
 * 🔬 테스트 5: 다양한 allowedParams 조합 테스트
 */
function testVariousAllowedParamsCombinations() {
    console.log('\n🔬 === Test 5: Various allowedParams Combinations Test ===');

    const testCases = [
        {
            name: 'Only basic fields',
            allowedParams: ['name', 'email'],
        },
        {
            name: 'Including problematic fields',
            allowedParams: ['name', 'email', 'phone', 'provider', 'role'],
        },
        {
            name: 'All nullable/default fields',
            allowedParams: ['bio', 'refreshToken', 'profileImage', 'provider', 'role'],
        },
        {
            name: 'Empty allowedParams',
            allowedParams: [],
        },
        {
            name: 'No allowedParams (undefined)',
            allowedParams: undefined,
        },
    ];

    testCases.forEach((testCase, index) => {
        console.log(`\n   ${index + 1}. ${testCase.name}:`);
        console.log(`      allowedParams: ${testCase.allowedParams ? JSON.stringify(testCase.allowedParams) : 'undefined'}`);

        try {
            const metadata = generateDynamicValidationMetadata(TestUser, testCase.allowedParams, Method.CREATE);
            const properties = getPropertyNamesFromMetadata(TestUser, Method.CREATE, testCase.allowedParams);

            console.log(`      Metadata fields: [${metadata.map((m) => m.propertyName).join(', ')}]`);
            console.log(`      Property names: [${properties.join(', ')}]`);
            console.log(`      ✅ Success`);
        } catch (error) {
            console.log(`      ❌ Error:`, error);
        }
    });
}

/**
 * 🔬 메인 테스트 실행
 */
function runIntegrationTests() {
    console.log('🧪 Starting Entity-based DTO Generation Integration Tests...\n');
    console.log('📌 Testing Entity: TestUser');
    console.log('📌 Problem Fields: phone, role, provider (no class-validator decorators)');
    console.log('📌 Expected: These fields should be included in DTO when in allowedParams');

    // 캐시 초기화
    clearValidationMetadataCache();

    try {
        testAllowedParamsPriority();
        testColumnBasedValidation();
        testDtoGeneration();
        testCachingPerformance();
        testVariousAllowedParamsCombinations();

        console.log('\n🎉 Integration tests completed!');

        // 최종 캐시 상태
        console.log('\n📊 Final cache statistics:');
        debugCacheStatus();
    } catch (error) {
        console.error('💥 Integration tests failed:', error);
    }
}

// 즉시 테스트 실행
runIntegrationTests();

// 테스트 엔티티와 함수들을 외부에서 사용할 수 있도록 export
export {
    Provider,
    runIntegrationTests,
    testAllowedParamsPriority,
    testCachingPerformance,
    testColumnBasedValidation,
    testDtoGeneration,
    TestUser,
    UserRole,
};
