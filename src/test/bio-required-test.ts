/**
 * 🧪 bio 필드 동작 테스트 - @IsOptional() 없는 버전
 *
 * 테스트 시나리오:
 * @Column({ default: 'ang' })
 * @IsString()
 * bio?: string;
 *
 * ⚠️ 주의: @IsOptional()이 없음! → 필수 필드가 됨
 */

import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import 'reflect-metadata';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    // ⚠️ @IsOptional() 없음 → 필수 필드!
    @Column({ default: 'ang' })
    @IsString()
    bio?: string;

    @Column()
    @IsString()
    name: string;
}

async function testRequiredBioField() {
    console.log('🧪 Testing bio field (REQUIRED - no @IsOptional) when excluded from request\n');

    console.log('🔥 중요: @IsOptional()이 없으므로 bio는 필수 필드입니다!\n');

    // 🎯 테스트 케이스들
    const testCases = [
        {
            name: '1. bio 필드 없음 (문제 상황)',
            body: { name: 'John' },
        },
        {
            name: '2. bio 필드 undefined',
            body: { name: 'John', bio: undefined },
        },
        {
            name: '3. bio 필드 null',
            body: { name: 'John', bio: null },
        },
        {
            name: '4. bio 필드 빈 문자열',
            body: { name: 'John', bio: '' },
        },
        {
            name: '5. bio 필드 정상 값',
            body: { name: 'John', bio: 'Hello World' },
        },
    ];

    for (const testCase of testCases) {
        console.log(`\n📌 ${testCase.name}`);
        console.log(`   요청 body: ${JSON.stringify(testCase.body)}`);

        try {
            // 1. plainToInstance로 변환
            const transformed = plainToInstance(TestUser, testCase.body);
            console.log(
                `   변환 후: ${JSON.stringify({
                    name: transformed.name,
                    bio: transformed.bio,
                    bioExists: 'bio' in transformed,
                    bioType: typeof transformed.bio,
                })}`,
            );

            // 2. CREATE 시나리오 (skipMissingProperties: false)
            console.log('   📝 CREATE 검증 (skipMissingProperties: false):');
            const createValidationErrors = await validate(transformed, {
                whitelist: true,
                forbidNonWhitelisted: false,
                forbidUnknownValues: false,
                skipMissingProperties: false, // CREATE 기본값
            });

            if (createValidationErrors.length > 0) {
                console.log(
                    `      ❌ 검증 실패:`,
                    createValidationErrors.map((e) => ({
                        property: e.property,
                        constraints: e.constraints,
                        value: e.value,
                    })),
                );
            } else {
                console.log(`      ✅ 검증 통과`);
            }

            // 3. UPDATE 시나리오 (skipMissingProperties: true)
            console.log('   📝 UPDATE 검증 (skipMissingProperties: true):');
            const updateValidationErrors = await validate(transformed, {
                whitelist: true,
                forbidNonWhitelisted: false,
                forbidUnknownValues: false,
                skipMissingProperties: true, // UPDATE 기본값
            });

            if (updateValidationErrors.length > 0) {
                console.log(
                    `      ❌ 검증 실패:`,
                    updateValidationErrors.map((e) => ({
                        property: e.property,
                        constraints: e.constraints,
                        value: e.value,
                    })),
                );
            } else {
                console.log(`      ✅ 검증 통과`);
            }
        } catch (error) {
            console.log(`   💥 오류:`, error);
        }
    }
}

// 실제 NestJS 환경에서 어떻게 동작하는지 시뮬레이션
async function simulateNestJSBehavior() {
    console.log('\n\n🎯 실제 NestJS CRUD 환경 시뮬레이션\n');

    const requestBody = { name: 'John' }; // bio 없음
    console.log('🌐 프론트엔드 요청:', JSON.stringify(requestBody));

    // CREATE 시나리오
    console.log('\n📝 CREATE 요청 시뮬레이션:');
    try {
        const transformed = plainToInstance(TestUser, requestBody);
        const errors = await validate(transformed, {
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            skipMissingProperties: false, // CREATE 기본값
        });

        if (errors.length > 0) {
            console.log('   💥 422 UnprocessableEntityException 발생!');
            console.log(
                '   오류 내용:',
                errors.map((e) => ({
                    field: e.property,
                    messages: Object.values(e.constraints || {}),
                })),
            );
        } else {
            console.log('   ✅ 검증 통과 → DB 저장');
            console.log('   💾 저장될 데이터: { name: "John", bio: "ang" }');
        }
    } catch (error) {
        console.log('   💥 예외 발생:', error);
    }

    // UPDATE 시나리오
    console.log('\n📝 UPDATE 요청 시뮬레이션:');
    try {
        const transformed = plainToInstance(TestUser, requestBody);
        const errors = await validate(transformed, {
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            skipMissingProperties: true, // UPDATE 기본값
        });

        if (errors.length > 0) {
            console.log('   💥 422 UnprocessableEntityException 발생!');
            console.log(
                '   오류 내용:',
                errors.map((e) => ({
                    field: e.property,
                    messages: Object.values(e.constraints || {}),
                })),
            );
        } else {
            console.log('   ✅ 검증 통과 → DB 업데이트');
            console.log('   💾 업데이트: SET name="John" (bio는 건드리지 않음)');
        }
    } catch (error) {
        console.log('   💥 예외 발생:', error);
    }
}

async function runTests() {
    await testRequiredBioField();
    await simulateNestJSBehavior();

    console.log('\n🎉 테스트 완료!');

    console.log('\n💡 핵심 포인트:');
    console.log('   - @IsOptional() 없으면 bio는 필수 필드');
    console.log('   - CREATE: skipMissingProperties=false → 검증 실패 가능성');
    console.log('   - UPDATE: skipMissingProperties=true → 검증 통과 가능성');
    console.log('   - DB default는 검증과 별개 (검증 먼저, DB 저장은 나중)');
}

runTests().catch(console.error);

export { testRequiredBioField, TestUser };
