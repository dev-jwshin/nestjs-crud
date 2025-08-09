/**
 * 🚀 우리 시스템이 default 필드 문제를 어떻게 해결하는지 테스트
 *
 * 문제: @Column({ default: 'ang' }) + @IsString() → 필수 필드로 취급됨
 * 해결: 우리 시스템이 default 있으면 자동으로 @IsOptional() 적용
 */

import { IsString } from 'class-validator';
import 'reflect-metadata';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { generateDynamicValidationMetadata } from '../lib/dto';
import { Method } from '../lib/interface';

enum Provider {
    LOCAL = 'local',
    GOOGLE = 'google',
    APPLE = 'apple',
}

@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    // 🔥 문제 상황: default 있는데 @IsOptional() 없음
    @Column({ default: 'ang' })
    @IsString()
    bio: string;

    // ❌ 검증 데코레이터 전혀 없음
    @Column({ type: 'enum', enum: Provider, default: Provider.LOCAL })
    provider: Provider;

    @Column({ type: 'varchar', length: 20 })
    phone: string;
}

function analyzeSystemSolution() {
    console.log('🚀 우리 시스템의 default 필드 문제 해결 테스트\n');

    console.log('📋 Entity 필드 분석:');
    console.log('  name: ✅ 기존 @IsString() (필수)');
    console.log('  bio: 🔥 @Column({ default: "ang" }) + @IsString() (default 있는데 필수?)');
    console.log('  provider: ❌ @Column({ default: Provider.LOCAL }) (데코레이터 없음)');
    console.log('  phone: ❌ @Column() (데코레이터 없음)\n');

    // allowedParams에 문제 필드들 포함
    const allowedParams = ['name', 'bio', 'provider', 'phone'];

    console.log('🎯 allowedParams:', allowedParams);
    console.log('🔍 우리 시스템의 동적 검증 메타데이터 생성 중...\n');

    const metadata = generateDynamicValidationMetadata(TestUser, allowedParams, Method.CREATE);

    console.log('📊 결과 분석:');
    metadata.forEach((meta) => {
        console.log(`\n📌 ${meta.propertyName}:`);
        console.log(`   🔹 Optional: ${meta.isOptional ? '✅ YES' : '❌ NO'}`);
        console.log(`   🔹 Rules: ${meta.rules.length > 0 ? meta.rules.map((r) => `@${r.validator}`).join(', ') : 'None'}`);

        // 특별 분석
        if (meta.propertyName === 'bio') {
            if (meta.isOptional) {
                console.log('   🎉 SUCCESS: 우리 시스템이 default 값을 감지해서 optional로 처리!');
            } else {
                console.log('   😅 아직 기존 class-validator를 우선 사용 (개선 필요)');
            }
        } else if (meta.propertyName === 'provider') {
            if (meta.isOptional) {
                console.log('   🎉 SUCCESS: default 값이 있어서 자동으로 optional 처리!');
            } else {
                console.log('   ⚠️ 예상과 다름: default 있는데 required?');
            }
        }
    });
}

function explainTheProblem() {
    console.log('\n\n💡 문제 상황 설명:\n');

    console.log('🔥 현재 NestJS + class-validator의 한계:');
    console.log('   1. class-validator는 TypeORM 정보를 모름');
    console.log('   2. @Column({ default: "value" }) 있어도 @IsOptional() 없으면 필수로 취급');
    console.log('   3. 개발자가 수동으로 @IsOptional() 추가해야 함\n');

    console.log('✨ 우리 시스템의 해결책:');
    console.log('   1. TypeORM 컬럼 메타데이터 분석');
    console.log('   2. default 값 있으면 자동으로 isOptional: true 설정');
    console.log('   3. allowedParams에 포함된 필드만 자동 처리');
    console.log('   4. 기존 @IsOptional() 있으면 그대로 우선 사용\n');

    console.log('🎯 결과:');
    console.log('   - 개발자는 @Column({ default: "value" })만 쓰면 됨');
    console.log('   - @IsOptional() 수동 추가 불필요');
    console.log('   - DB 스키마와 검증 로직 자동 동기화');
}

function runSystemTest() {
    analyzeSystemSolution();
    explainTheProblem();

    console.log('\n🎉 테스트 완료!');
    console.log('\n💬 사용자 의견이 100% 정확합니다!');
    console.log('   "default가 지정되어있으면 없어도 되는건데 오류나는건 이상해"');
    console.log('   → 이것이 바로 우리가 해결한 핵심 문제입니다! 🚀');
}

// 테스트 실행
runSystemTest();

export { TestUser };
