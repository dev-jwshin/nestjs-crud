/**
 * 🧪 기존 데코레이터 vs 자동 생성 우선순위 테스트
 */

import { IsOptional, IsString } from 'class-validator';
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
class TestEntity {
    @PrimaryGeneratedColumn()
    id: number;

    // ✅ 기존 데코레이터 있음 - 그대로 사용될 것
    @Column({ nullable: true, default: 'ang' })
    @IsOptional()
    @IsString()
    bio?: string;

    // ❌ 데코레이터 없음 - 자동 생성될 것
    @Column({ type: 'enum', enum: Provider, default: Provider.LOCAL })
    provider: Provider;

    // ❌ 데코레이터 없음 - 자동 생성될 것
    @Column({ type: 'varchar', length: 20 })
    phone: string;
}

function testDecoratorPriority() {
    console.log('🧪 Testing Decorator Priority...\n');

    const allowedParams = ['bio', 'provider', 'phone'];

    console.log('📋 Test Entity Fields:');
    console.log('  bio: ✅ Has @IsOptional + @IsString (existing)');
    console.log('  provider: ❌ No decorators (auto-generated)');
    console.log('  phone: ❌ No decorators (auto-generated)\n');

    const metadata = generateDynamicValidationMetadata(TestEntity, allowedParams, Method.CREATE);

    console.log('🔍 Results:');
    metadata.forEach((meta) => {
        console.log(`\n📌 ${meta.propertyName}:`);
        console.log(`   Optional: ${meta.isOptional ? '✅' : '❌'}`);
        console.log(`   Rules: ${meta.rules.length > 0 ? meta.rules.map((r) => `@${r.validator}`).join(', ') : 'None'}`);

        if (meta.propertyName === 'bio') {
            console.log(`   🎯 Source: Existing class-validator decorators`);
        } else {
            console.log(`   🎯 Source: Auto-generated from TypeORM`);
        }
    });
}

// 테스트 실행
testDecoratorPriority();

export { testDecoratorPriority, TestEntity };
