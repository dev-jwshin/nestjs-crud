import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { Exclude, Transform } from 'class-transformer';
import { CrudOperationHelper } from '../lib/utils/crud-operation-helper';
import { crudResponse } from '../lib/interface/response.interface';
import { CrudOptions } from '../lib/interface';

@Entity()
class TestUser {
    @PrimaryGeneratedColumn()
    id: number;

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

    @Column()
    @Exclude() // Should be excluded in responses
    password: string;

    @Column({ default: true })
    isActive: boolean;

    @Transform(({ value }) => value?.toUpperCase())
    @Column({ nullable: true })
    role?: string;
}

describe('Transform Optimization Tests', () => {
    let module: TestingModule;
    let repository: Repository<TestUser>;
    let crudOperationHelper: CrudOperationHelper<TestUser>;

    const mockRepository = {
        metadata: {
            tableName: 'test_user',
            primaryColumns: [{ propertyName: 'id' }],
            columns: [
                { propertyName: 'id', databaseName: 'id', type: 'int', isNullable: false, isPrimary: true },
                { propertyName: 'name', databaseName: 'name', type: 'varchar', isNullable: false, isPrimary: false },
                { propertyName: 'email', databaseName: 'email', type: 'varchar', isNullable: false, isPrimary: false },
                { propertyName: 'bio', databaseName: 'bio', type: 'text', isNullable: true, isPrimary: false },
                { propertyName: 'password', databaseName: 'password', type: 'varchar', isNullable: false, isPrimary: false },
                { propertyName: 'isActive', databaseName: 'is_active', type: 'boolean', isNullable: false, isPrimary: false },
                { propertyName: 'role', databaseName: 'role', type: 'varchar', isNullable: true, isPrimary: false },
            ],
            relations: [],
        },
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        findAndCount: jest.fn(),
    };

    const crudOptions: CrudOptions = {
        entity: TestUser,
        allowedParams: ['name', 'email', 'bio', 'role'],
        routes: {
            create: { exclude: ['password'] },
            update: { exclude: ['password'] },
        },
    };

    beforeEach(async () => {
        module = await Test.createTestingModule({
            providers: [
                {
                    provide: getRepositoryToken(TestUser),
                    useValue: mockRepository,
                },
            ],
        }).compile();

        repository = module.get<Repository<TestUser>>(getRepositoryToken(TestUser));
        crudOperationHelper = new CrudOperationHelper(repository, crudOptions);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('crudResponse skipTransform functionality', () => {
        it('should skip transformation when skipTransform is true', () => {
            const testData = {
                id: 1,
                name: 'Test User',
                email: 'test@example.com',
                password: 'should-be-visible', // Will be visible since transform is skipped
                isActive: true,
            };

            const response = crudResponse(testData, { skipTransform: true });

            expect(response.data).toEqual(testData);
            expect(response.data.password).toBe('should-be-visible'); // @Exclude not applied
            expect(response.metadata?.timestamp).toBeDefined();
            expect(response.metadata?.affectedCount).toBe(1);
        });

        it('should apply transformation when skipTransform is false', () => {
            // Create an actual entity instance for @Exclude to work
            const testUser = new TestUser();
            testUser.id = 1;
            testUser.name = 'Test User';
            testUser.email = 'test@example.com';
            testUser.password = 'should-be-hidden';
            testUser.isActive = true;

            const response = crudResponse(testUser, { skipTransform: false });

            expect(response.data.password).toBeUndefined(); // @Exclude applied
            expect(response.data.name).toBe('Test User');
            expect(response.metadata?.timestamp).toBeDefined();
        });

        it('should default to transformation when skipTransform is not specified', () => {
            // Create an actual entity instance for @Exclude to work
            const testUser = new TestUser();
            testUser.id = 1;
            testUser.name = 'Test User';
            testUser.email = 'test@example.com';
            testUser.password = 'should-be-hidden';
            testUser.isActive = true;

            const response = crudResponse(testUser);

            expect(response.data.password).toBeUndefined(); // @Exclude applied by default
        });

        it('should handle array data with skipTransform', () => {
            const testData = [
                { id: 1, name: 'User 1', password: 'secret1' },
                { id: 2, name: 'User 2', password: 'secret2' },
            ];

            const response = crudResponse(testData, { skipTransform: true });

            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data[0].password).toBe('secret1'); // @Exclude not applied
            expect(response.data[1].password).toBe('secret2');
            expect(response.metadata?.affectedCount).toBe(2);
        });
    });

    describe('CrudOperationHelper optimized methods', () => {
        beforeEach(() => {
            mockRepository.create.mockImplementation((data) => ({ ...data, id: 1 }));
            mockRepository.save.mockImplementation((data) => Promise.resolve(data));
            mockRepository.findOne.mockResolvedValue({
                id: 1,
                name: 'Existing User',
                email: 'existing@example.com',
                password: 'hashedpassword',
                isActive: true,
            });
        });

        it('should use optimized createWithResponse method', async () => {
            const userData = {
                name: 'New User',
                email: 'new@example.com',
                password: 'plainpassword',
                bio: 'Test bio',
            };

            const response = await crudOperationHelper.createWithResponse(userData, {
                validate: false, // Skip validation for test
                responseOptions: {
                    excludedFields: ['password'],
                },
            });

            expect(response.data).toBeDefined();
            expect(response.data.name).toBe('New User');
            expect(response.data.password).toBeUndefined(); // Should be excluded
            expect(response.metadata?.timestamp).toBeDefined();
            expect(response.metadata?.affectedCount).toBe(1);
            expect(mockRepository.save).toHaveBeenCalledTimes(1);
        });

        it('should use optimized updateWithResponse method', async () => {
            const updateData = {
                name: 'Updated User',
                bio: 'Updated bio',
            };

            const response = await crudOperationHelper.updateWithResponse(1, updateData, {
                validate: false, // Skip validation for test
                responseOptions: {
                    excludedFields: ['password'],
                },
            });

            expect(response.data).toBeDefined();
            expect(response.data.name).toBe('Updated User');
            expect(response.data.password).toBeUndefined(); // Should be excluded
            expect(response.metadata?.timestamp).toBeDefined();
            expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(mockRepository.save).toHaveBeenCalledTimes(1);
        });

        it('should use optimized bulkCreateWithResponse method', async () => {
            const usersData = [
                { name: 'User 1', email: 'user1@example.com', password: 'pass1' },
                { name: 'User 2', email: 'user2@example.com', password: 'pass2' },
            ];

            // Mock different IDs for different users
            mockRepository.create
                .mockReturnValueOnce({ ...usersData[0], id: 1 })
                .mockReturnValueOnce({ ...usersData[1], id: 2 });

            const response = await crudOperationHelper.bulkCreateWithResponse(usersData, {
                validate: false, // Skip validation for test
                batchSize: 2,
                responseOptions: {
                    excludedFields: ['password'],
                },
            });

            expect(Array.isArray(response.data)).toBe(true);
            expect(response.data).toHaveLength(2);
            expect(response.data[0].name).toBe('User 1');
            expect(response.data[1].name).toBe('User 2');
            expect(response.data[0].password).toBeUndefined(); // Should be excluded
            expect(response.data[1].password).toBeUndefined(); // Should be excluded
            expect(response.metadata?.affectedCount).toBe(2);
            expect(mockRepository.save).toHaveBeenCalledTimes(2);
        });

        it('should handle validation errors properly', async () => {
            const invalidData = {
                name: '', // Invalid empty name
                email: 'invalid-email', // Invalid email format
            };

            await expect(
                crudOperationHelper.createWithResponse(invalidData, {
                    validate: true,
                })
            ).rejects.toThrow();
        });
    });

    describe('Performance comparisons', () => {
        const generateTestData = (count: number) => {
            return Array.from({ length: count }, (_, index) => ({
                id: index + 1,
                name: `User ${index + 1}`,
                email: `user${index + 1}@example.com`,
                password: `password${index + 1}`,
                isActive: true,
                role: 'user',
            }));
        };

        it('should demonstrate performance improvement with skipTransform', () => {
            const largeDataset = generateTestData(1000);

            // Measure time without skipTransform (with transformation)
            const startWithTransform = performance.now();
            const responseWithTransform = crudResponse(largeDataset, { skipTransform: false });
            const timeWithTransform = performance.now() - startWithTransform;

            // Measure time with skipTransform (without transformation)
            const startWithoutTransform = performance.now();
            const responseWithoutTransform = crudResponse(largeDataset, { skipTransform: true });
            const timeWithoutTransform = performance.now() - startWithoutTransform;

            // skipTransform should be faster
            expect(timeWithoutTransform).toBeLessThan(timeWithTransform);

            // Both should have correct metadata
            expect(responseWithTransform.metadata?.affectedCount).toBe(1000);
            expect(responseWithoutTransform.metadata?.affectedCount).toBe(1000);

            console.log(`Performance comparison:
            - With transform: ${timeWithTransform.toFixed(2)}ms
            - Without transform (skipTransform): ${timeWithoutTransform.toFixed(2)}ms
            - Improvement: ${((timeWithTransform - timeWithoutTransform) / timeWithTransform * 100).toFixed(1)}%`);
        });
    });

    describe('Integration scenarios', () => {
        it('should work correctly in a typical controller pattern', async () => {
            // Simulate a typical controller method using both helpers
            const requestData = {
                name: 'Integration User',
                email: 'integration@example.com',
                password: 'secretpassword',
                bio: 'Integration test bio',
            };

            // Step 1: Use CrudOperationHelper to create entity (this applies transform)
            mockRepository.create.mockReturnValue({ ...requestData, id: 1 });
            const createdEntity = await crudOperationHelper.create(requestData, {
                validate: false,
                exclude: ['password'],
            });

            // Step 2: Use crudResponse with skipTransform since data is already transformed
            const finalResponse = crudResponse(createdEntity, {
                skipTransform: true,
                excludedFields: ['password'],
            });

            expect(finalResponse.data.name).toBe('Integration User');
            expect(finalResponse.data.password).toBeUndefined(); // Excluded by CrudOperationHelper
            expect(finalResponse.metadata?.timestamp).toBeDefined();
            expect(finalResponse.metadata?.excludedFields).toContain('password');
        });

        it('should handle the optimized WithResponse methods correctly', async () => {
            const requestData = {
                name: 'Optimized User',
                email: 'optimized@example.com',
                password: 'secretpassword',
            };

            mockRepository.create.mockReturnValue({ ...requestData, id: 1 });

            // Use the optimized method that combines both operations
            const response = await crudOperationHelper.createWithResponse(requestData, {
                validate: false,
                exclude: ['password'],
                responseOptions: {
                    excludedFields: ['password'],
                },
            });

            expect(response.data.name).toBe('Optimized User');
            expect(response.data.password).toBeUndefined();
            expect(response.metadata?.timestamp).toBeDefined();
            expect(response.metadata?.excludedFields).toContain('password');
        });
    });
});