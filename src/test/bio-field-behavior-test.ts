/**
 * 🧪 bio 필드 동작 테스트
 *
 * 테스트 시나리오:
 * @Column({ nullable: true, default: 'ang' })
 * @IsOptional()
 * @IsString()
 * bio?: string;
 *
 * 프론트에서 bio 필드를 포함하지 않고 요청하면?
 */

import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validate } from 'class-validator';
import 'reflect-metadata';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true, default: 'ang' })
    @IsOptional()
    @IsString()
    bio?: string;

    @Column()
    @IsString()
    name: string;
}

async function testBioFieldBehavior() {
    console.log('🧪 Testing bio field behavior when excluded from request\n');

    // 🎯 테스트 케이스들
    const testCases = [
        {
            name: '1. bio 필드 없음 (일반적인 경우)',
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
            // 1. plainToInstance로 변환 (실제 interceptor에서 하는 것)
            const transformed = plainToInstance(TestUser, testCase.body);
            console.log(
                `   변환 후: ${JSON.stringify({
                    name: transformed.name,
                    bio: transformed.bio,
                    bioExists: 'bio' in transformed,
                    bioType: typeof transformed.bio,
                })}`,
            );

            // 2. class-validator 검증
            const validationErrors = await validate(transformed, {
                whitelist: true,
                forbidNonWhitelisted: false,
                forbidUnknownValues: false,
                skipMissingProperties: false, // CREATE의 기본값
            });

            if (validationErrors.length > 0) {
                console.log(
                    `   ❌ 검증 실패:`,
                    validationErrors.map((e) => ({
                        property: e.property,
                        constraints: e.constraints,
                        value: e.value,
                    })),
                );
            } else {
                console.log(`   ✅ 검증 통과`);
            }

            // 3. 실제 DB 저장 시 예상 동작
            console.log(`   💾 DB 저장 예상:`);
            if (transformed.bio === undefined) {
                console.log(`      - bio는 undefined → DB default 'ang' 적용`);
            } else if (transformed.bio === null) {
                console.log(`      - bio는 null → DB에 null 저장 (nullable: true)`);
            } else {
                console.log(`      - bio는 '${transformed.bio}' → 그대로 저장`);
            }
        } catch (error) {
            console.log(`   💥 오류:`, error);
        }
    }
}

// skipMissingProperties 옵션 테스트
async function testSkipMissingProperties() {
    console.log('\n\n🔬 skipMissingProperties 옵션별 동작 테스트\n');

    const body = { name: 'John' }; // bio 없음
    const transformed = plainToInstance(TestUser, body);

    const options = [
        { skipMissingProperties: false, description: 'CREATE 기본값 (false)' },
        { skipMissingProperties: true, description: 'UPDATE 기본값 (true)' },
    ];

    for (const option of options) {
        console.log(`📌 ${option.description}`);
        console.log(`   skipMissingProperties: ${option.skipMissingProperties}`);

        const validationErrors = await validate(transformed, {
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            skipMissingProperties: option.skipMissingProperties,
        });

        if (validationErrors.length > 0) {
            console.log(
                `   ❌ 검증 실패:`,
                validationErrors.map((e) => e.constraints),
            );
        } else {
            console.log(`   ✅ 검증 통과`);
        }
    }
}

// 테스트 실행
async function runTests() {
    await testBioFieldBehavior();
    await testSkipMissingProperties();

    console.log('\n🎉 모든 테스트 완료!');
}

runTests().catch(console.error);

export { testBioFieldBehavior, TestUser };
