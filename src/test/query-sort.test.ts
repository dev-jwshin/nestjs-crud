import { Test, TestingModule } from '@nestjs/testing';
import { Controller, INestApplication, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';

/**
 * 정렬 테스트를 위한 엔티티
 */
@Entity('test_job_categories')
class JobCategory {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    name!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

/**
 * 정렬 테스트를 위한 컨트롤러
 */
@Controller('test_job_categories')
@Crud({
    entity: JobCategory,
    routes: {
        index: {
            allowedFilters: ['name', 'createdAt', 'updatedAt'],
        },
    },
})
class JobCategoryController {
    constructor(public readonly crudService: CrudService<JobCategory>) {}
}

@Module({
    imports: [TypeOrmModule.forFeature([JobCategory])],
    controllers: [JobCategoryController],
    providers: [
        {
            provide: CrudService,
            useFactory: (repo: any) => new CrudService(repo),
            inject: ['JobCategoryRepository'],
        },
    ],
})
class TestModule {}

describe('Query Sort (정렬 버그 수정 테스트)', () => {
    let app: INestApplication;
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [JobCategory],
                    synchronize: true,
                    logging: false,
                }),
                TestModule,
            ],
        }).compile();

        app = module.createNestApplication();
        await app.init();

        // 테스트 데이터 생성 (시간 차이를 두고 생성)
        const crudService = module.get(CrudService);
        const repository = crudService.repository;

        // 의도적으로 시간 차이를 두고 생성
        await repository.save({ name: 'IT개발·데이터', createdAt: new Date('2025-09-24T02:07:21.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: '디자인', createdAt: new Date('2025-09-24T02:07:22.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: '마케팅', createdAt: new Date('2025-09-24T02:07:23.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: '기획·PM·운영', createdAt: new Date('2025-09-24T02:07:24.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: 'CS·영업·판매', createdAt: new Date('2025-09-24T02:07:25.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: '회계·재무·세무', createdAt: new Date('2025-09-24T02:07:26.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: 'HR', createdAt: new Date('2025-09-24T02:07:27.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
        await repository.save({ name: '기타', createdAt: new Date('2025-09-24T02:07:28.468Z'), updatedAt: new Date('2025-09-24T02:07:21.468Z') });
    });

    afterAll(async () => {
        await app?.close();
    });

    describe('단일 필드 정렬', () => {
        it('createdAt 오름차순 정렬이 시간 순서대로 작동해야 함', async () => {
            // When: createdAt으로 오름차순 정렬
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=createdAt')
                .expect(200);

            // Then: createdAt이 오래된 순서대로 정렬되어야 함
            expect(response.body.data).toHaveLength(8);

            const createdAtDates = response.body.data.map((item: JobCategory) => new Date(item.createdAt).getTime());

            // 각 항목이 이전 항목보다 크거나 같아야 함 (오름차순)
            for (let i = 1; i < createdAtDates.length; i++) {
                expect(createdAtDates[i]).toBeGreaterThanOrEqual(createdAtDates[i - 1]);
            }

            // 첫 번째와 마지막 항목 확인
            expect(response.body.data[0].name).toBe('IT개발·데이터');
            expect(response.body.data[7].name).toBe('기타');
        });

        it('createdAt 내림차순 정렬이 시간 역순으로 작동해야 함', async () => {
            // When: createdAt으로 내림차순 정렬
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=-createdAt')
                .expect(200);

            // Then: createdAt이 최신 순서대로 정렬되어야 함
            expect(response.body.data).toHaveLength(8);

            const createdAtDates = response.body.data.map((item: JobCategory) => new Date(item.createdAt).getTime());

            // 각 항목이 이전 항목보다 작거나 같아야 함 (내림차순)
            for (let i = 1; i < createdAtDates.length; i++) {
                expect(createdAtDates[i]).toBeLessThanOrEqual(createdAtDates[i - 1]);
            }

            // 첫 번째와 마지막 항목 확인
            expect(response.body.data[0].name).toBe('기타');
            expect(response.body.data[7].name).toBe('IT개발·데이터');
        });

        it('name 필드 정렬이 작동해야 함', async () => {
            // When: name으로 오름차순 정렬
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=name')
                .expect(200);

            // Then: name이 알파벳/가나다 순으로 정렬되어야 함
            expect(response.body.data).toHaveLength(8);

            const names = response.body.data.map((item: JobCategory) => item.name);
            const sortedNames = [...names].sort();

            expect(names).toEqual(sortedNames);
        });
    });

    describe('복합 정렬', () => {
        it('updatedAt, createdAt 복합 정렬이 작동해야 함', async () => {
            // When: updatedAt DESC, createdAt ASC로 정렬
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=-updatedAt,createdAt')
                .expect(200);

            // Then: updatedAt으로 먼저 정렬되고, 같으면 createdAt으로 정렬
            expect(response.body.data).toHaveLength(8);

            // updatedAt이 모두 같으므로, createdAt 오름차순으로 정렬되어야 함
            const createdAtDates = response.body.data.map((item: JobCategory) => new Date(item.createdAt).getTime());

            for (let i = 1; i < createdAtDates.length; i++) {
                expect(createdAtDates[i]).toBeGreaterThanOrEqual(createdAtDates[i - 1]);
            }
        });
    });

    describe('정렬과 페이지네이션 조합', () => {
        it('정렬 + limit 페이지네이션이 작동해야 함', async () => {
            // When: createdAt 오름차순 정렬 + limit (RESTful 쿼리 형식)
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=createdAt&page[limit]=3')
                .expect(200);

            // Then: 처음 3개 항목이 반환되어야 함
            expect(response.body.data).toHaveLength(3);
            expect(response.body.data[0].name).toBe('IT개발·데이터');
            expect(response.body.data[1].name).toBe('디자인');
            expect(response.body.data[2].name).toBe('마케팅');

            // 메타데이터 확인
            expect(response.body.metadata.pagination.total).toBe(8);
        });

        it('정렬 + offset 페이지네이션이 작동해야 함', async () => {
            // When: createdAt 오름차순 정렬 + offset (RESTful 쿼리 형식)
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=createdAt&page[offset]=5&page[limit]=3')
                .expect(200);

            // Then: 5번째부터 3개 항목이 반환되어야 함
            expect(response.body.data).toHaveLength(3);
            expect(response.body.data[0].name).toBe('회계·재무·세무');
            expect(response.body.data[1].name).toBe('HR');
            expect(response.body.data[2].name).toBe('기타');
        });
    });

    describe('버그 재현 테스트 (실제 이슈 케이스)', () => {
        it('[BUG-FIX] sort=createdAt 쿼리가 실제 createdAt 필드로 정렬해야 함', async () => {
            // Given: 사용자가 보고한 실제 케이스
            // https://local.flexwork.co.kr:3000/api/backend/job-categories?sort=createdAt

            // When: sort=createdAt으로 요청
            const response = await request(app.getHttpServer())
                .get('/test_job_categories?sort=createdAt')
                .expect(200);

            // Then: 응답 데이터가 createdAt 시간 순서대로 정렬되어야 함
            const data = response.body.data;

            // 원본 데이터의 실제 순서 확인
            const expectedOrder = [
                'IT개발·데이터',      // 2025-09-24T02:07:21.468Z
                '디자인',             // 2025-09-24T02:07:22.468Z
                '마케팅',             // 2025-09-24T02:07:23.468Z
                '기획·PM·운영',       // 2025-09-24T02:07:24.468Z
                'CS·영업·판매',       // 2025-09-24T02:07:25.468Z
                '회계·재무·세무',     // 2025-09-24T02:07:26.468Z
                'HR',                // 2025-09-24T02:07:27.468Z
                '기타',              // 2025-09-24T02:07:28.468Z
            ];

            const actualOrder = data.map((item: JobCategory) => item.name);

            // 실제 순서와 기대 순서가 일치해야 함
            expect(actualOrder).toEqual(expectedOrder);

            // 각 항목의 createdAt이 이전 항목보다 크거나 같은지 확인
            for (let i = 1; i < data.length; i++) {
                const prevTime = new Date(data[i - 1].createdAt).getTime();
                const currTime = new Date(data[i].createdAt).getTime();
                expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }
        });
    });
});
