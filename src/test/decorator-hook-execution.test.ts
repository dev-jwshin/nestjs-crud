import { Controller, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, PrimaryGeneratedColumn, DataSource } from 'typeorm';
import request from 'supertest';

import { Crud, CrudService, BeforeCreate, AfterCreate } from '../index';
import type { HookContext } from '../lib/interface';

import { IsOptional, IsString } from 'class-validator';

// Test Entity
@Entity()
class TestEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    @IsString()
    name!: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    userId?: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    processedBy?: string;
}

// Test Service
class TestService extends CrudService<TestEntity> {
    constructor(dataSource: DataSource) {
        super(dataSource.getRepository(TestEntity));
    }
}

// Test Controller with Decorator Hooks
@Controller('test-entities')
@Crud({
    entity: TestEntity,
    only: ['create', 'show'],
    allowedParams: ['name', 'userId'],
})
class TestController {
    constructor(public readonly crudService: TestService) {}

    @BeforeCreate()
    async beforeCreateHook(body: any, context: HookContext<TestEntity>): Promise<any> {
        console.log('BeforeCreate hook executed!');
        // Add userId from a mock auth context
        body.userId = 'user-123-from-hook';
        return body;
    }

    @AfterCreate()
    async afterCreateHook(entity: TestEntity, context: HookContext<TestEntity>): Promise<TestEntity> {
        console.log('AfterCreate hook executed!');
        // Add processing info
        entity.processedBy = 'hook-processor';
        return entity;
    }
}

describe('Decorator Hook Execution', () => {
    let app: any;
    let dataSource: DataSource;

    beforeAll(async () => {
        // Create in-memory SQLite database
        dataSource = new DataSource({
            type: 'sqlite',
            database: ':memory:',
            entities: [TestEntity],
            synchronize: true,
            logging: false,
        });
        await dataSource.initialize();

        // Create test module
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [TestEntity],
                    synchronize: true,
                }),
                TypeOrmModule.forFeature([TestEntity]),
            ],
            controllers: [TestController],
            providers: [
                {
                    provide: TestService,
                    useFactory: () => new TestService(dataSource),
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app?.close();
        await dataSource?.destroy();
    });

    describe('CREATE with @BeforeCreate and @AfterCreate hooks', () => {
        it('should execute BeforeCreate hook and modify body', async () => {
            const createDto = {
                name: 'Test Item',
            };

            const response = await request(app.getHttpServer())
                .post('/test-entities')
                .send(createDto)
                .expect(201);

            // Check that BeforeCreate hook added userId
            expect(response.body.data.userId).toBe('user-123-from-hook');
            expect(response.body.data.name).toBe('Test Item');

            // Check that AfterCreate hook added processedBy
            expect(response.body.data.processedBy).toBe('hook-processor');
        });

        it('should persist the hook-modified data in database', async () => {
            const createDto = {
                name: 'Another Test Item',
            };

            const createResponse = await request(app.getHttpServer())
                .post('/test-entities')
                .send(createDto)
                .expect(201);

            const entityId = createResponse.body.data.id;

            // AfterCreate hook should affect the response
            expect(createResponse.body.data.processedBy).toBe('hook-processor');

            // Fetch the entity to verify BeforeCreate changes were persisted
            const getResponse = await request(app.getHttpServer())
                .get(`/test-entities/${entityId}`)
                .expect(200);

            expect(getResponse.body.data.userId).toBe('user-123-from-hook');
            expect(getResponse.body.data.name).toBe('Another Test Item');
            // Note: processedBy is not persisted because AfterCreate runs after saving
            // It only affects the response, not the stored data
            expect(getResponse.body.data.processedBy).toBeNull();
        });
    });

    describe('Hook context access', () => {
        it('should have access to controller instance in hook context', async () => {
            // Create a controller with a method that checks context
            @Controller('context-test')
            @Crud({
                entity: TestEntity,
                only: ['create'],
                allowedParams: ['name'],
            })
            class ContextTestController {
                public testProperty = 'test-value';

                constructor(public readonly crudService: TestService) {}

                @BeforeCreate()
                async checkContext(body: any, context: HookContext<TestEntity>): Promise<any> {
                    // Access controller property through context
                    if (context.controller) {
                        body.name = context.controller.testProperty;
                    }
                    return body;
                }
            }

            const contextModule = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestEntity],
                        synchronize: true,
                    }),
                    TypeOrmModule.forFeature([TestEntity]),
                ],
                controllers: [ContextTestController],
                providers: [
                    {
                        provide: TestService,
                        useFactory: () => new TestService(dataSource),
                    },
                ],
            }).compile();

            const contextApp = contextModule.createNestApplication();
            await contextApp.init();

            const response = await request(contextApp.getHttpServer())
                .post('/context-test')
                .send({ name: 'original' })
                .expect(201);

            // The name should be replaced with the controller's testProperty value
            expect(response.body.data.name).toBe('test-value');

            await contextApp.close();
        });
    });
});