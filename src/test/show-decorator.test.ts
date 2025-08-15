/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import request from 'supertest';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';
import { Method } from '../lib/interface';
import { BeforeShow, AfterShow, BeforeAssignShow, AfterAssignShow, BeforeAssign, AfterAssign } from '../lib/dto/lifecycle-hooks.decorator';

@Entity('test_users')
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column()
    @IsString()
    email: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    password?: string;

    @Column({ nullable: true })
    @IsOptional()
    lastViewedAt?: Date;
}

describe('Show Operation Decorators', () => {
    let app: INestApplication;

    afterEach(async () => {
        if (app) {
            await app.close();
        }
    });

    describe('BeforeShow and AfterShow decorators', () => {
        it('should execute hooks defined with BeforeShow and AfterShow decorators', async () => {
            let beforeShowCalled = false;
            let afterShowCalled = false;

            @Controller('users-show-decorators')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {},
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}

                @BeforeShow()
                async handleBeforeShow(params: any, context: any) {
                    beforeShowCalled = true;
                    expect(context.operation).toBe('show');
                    // Transform string ID to number
                    if (typeof params.id === 'string') {
                        params.id = Number.parseInt(params.id, 10);
                    }
                    return params;
                }

                @AfterShow()
                async handleAfterShow(entity: TestUser, _: any, context: any) {
                    afterShowCalled = true;
                    expect(context.operation).toBe('show');
                    // Mask sensitive data
                    if (entity.password) {
                        entity.password = '***HIDDEN***';
                    }
                    return entity;
                }
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithDecorators {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithDecorators,
                ],
            }).compile();

            app = moduleFixture.createNestApplication();
            await app.init();

            // Create test data
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
                password: 'secret123',
            });

            const response = await request(app.getHttpServer())
                .get(`/users-show-decorators/${user.id}`)
                .expect(200);

            expect(beforeShowCalled).toBe(true);
            expect(afterShowCalled).toBe(true);
            expect(response.body.data.password).toBe('***HIDDEN***');
        });
    });

    describe('BeforeAssignShow and AfterAssignShow decorators', () => {
        it('should execute hooks defined with BeforeAssignShow and AfterAssignShow decorators', async () => {
            let beforeAssignShowCalled = false;
            let afterAssignShowCalled = false;

            @Controller('users-assign-show-decorators')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {},
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}

                @BeforeAssignShow()
                async handleBeforeAssignShow(params: any, context: any) {
                    beforeAssignShowCalled = true;
                    expect(context.operation).toBe('show');
                    return params;
                }

                @AfterAssignShow()
                async handleAfterAssignShow(entity: TestUser, _: any, context: any) {
                    afterAssignShowCalled = true;
                    expect(context.operation).toBe('show');
                    // Add computed field
                    (entity as any).displayName = `${entity.name} <${entity.email}>`;
                    return entity;
                }
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithAssignDecorators {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithAssignDecorators,
                ],
            }).compile();

            app = moduleFixture.createNestApplication();
            await app.init();

            // Create test data
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(app.getHttpServer())
                .get(`/users-assign-show-decorators/${user.id}`)
                .expect(200);

            expect(beforeAssignShowCalled).toBe(true);
            expect(afterAssignShowCalled).toBe(true);
            expect(response.body.data.displayName).toBe('Test User <test@example.com>');
        });
    });

    describe('Generic BeforeAssign and AfterAssign decorators with show', () => {
        it('should execute hooks defined with BeforeAssign("show") and AfterAssign("show")', async () => {
            let beforeAssignCalled = false;
            let afterAssignCalled = false;

            @Controller('users-generic-assign-decorators')
            @Crud({
                entity: TestUser,
                routes: {
                    [Method.SHOW]: {},
                },
            })
            class TestController {
                constructor(public readonly crudService: CrudService<TestUser>) {}

                @BeforeAssign('show')
                async handleBeforeAssign(params: any, context: any) {
                    beforeAssignCalled = true;
                    expect(context.operation).toBe('show');
                    return params;
                }

                @AfterAssign('show')
                async handleAfterAssign(entity: TestUser, _: any, context: any) {
                    afterAssignCalled = true;
                    expect(context.operation).toBe('show');
                    // Add timestamp
                    entity.lastViewedAt = new Date();
                    return entity;
                }
            }

            @Module({
                imports: [TypeOrmModule.forFeature([TestUser])],
                controllers: [TestController],
                providers: [
                    {
                        provide: CrudService,
                        useFactory: (repository) => new CrudService(repository),
                        inject: ['TestUserRepository'],
                    },
                ],
            })
            class TestModuleWithGenericDecorators {}

            const moduleFixture = await Test.createTestingModule({
                imports: [
                    TypeOrmModule.forRoot({
                        type: 'sqlite',
                        database: ':memory:',
                        entities: [TestUser],
                        synchronize: true,
                        logging: false,
                    }),
                    TestModuleWithGenericDecorators,
                ],
            }).compile();

            app = moduleFixture.createNestApplication();
            await app.init();

            // Create test data
            const repository = moduleFixture.get('TestUserRepository');
            const user = await repository.save({
                name: 'Test User',
                email: 'test@example.com',
            });

            const response = await request(app.getHttpServer())
                .get(`/users-generic-assign-decorators/${user.id}`)
                .expect(200);

            expect(beforeAssignCalled).toBe(true);
            expect(afterAssignCalled).toBe(true);
            expect(response.body.data.lastViewedAt).toBeDefined();
        });
    });
});