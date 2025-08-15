/**
 * CRUD Operations Test Cases
 * 
 * 이 테스트는 NestJS CRUD 패키지의 핵심 CRUD 작업을 검증합니다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';

describe('CRUD Operations', () => {
    let app: INestApplication;
    let testModule: TestingModule;

    beforeEach(async () => {
        // 테스트 환경 설정
    });

    afterEach(async () => {
        await app?.close();
    });

    describe('CREATE Operations', () => {
        describe('단일 엔티티 생성', () => {
            it('TC-CREATE-001: 유효한 데이터로 엔티티를 생성해야 함', async () => {
                // Given: 유효한 사용자 데이터
                const userData = {
                    name: 'John Doe',
                    email: 'john@example.com',
                    age: 30
                };

                // When: POST 요청을 보냄
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 생성된 엔티티가 반환되어야 함
                expect(response.body.data).toMatchObject(userData);
                expect(response.body.data.id).toBeDefined();
                expect(response.body.message).toBe('User created successfully');
            });

            it('TC-CREATE-002: 필수 필드가 누락된 경우 400 에러를 반환해야 함', async () => {
                // Given: 필수 필드가 누락된 데이터
                const invalidData = {
                    email: 'john@example.com'
                    // name 필드 누락
                };

                // When: POST 요청을 보냄
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(invalidData)
                    .expect(400);

                // Then: 검증 에러가 반환되어야 함
                expect(response.body.error).toBe('Validation failed');
                expect(response.body.details).toContain('name should not be empty');
            });

            it('TC-CREATE-003: 중복된 unique 필드로 생성 시 409 에러를 반환해야 함', async () => {
                // Given: 이미 존재하는 이메일
                const existingEmail = 'existing@example.com';
                await createUser({ email: existingEmail, name: 'Existing User' });

                // When: 동일한 이메일로 사용자 생성 시도
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send({ email: existingEmail, name: 'New User' })
                    .expect(409);

                // Then: 충돌 에러가 반환되어야 함
                expect(response.body.error).toBe('Conflict');
                expect(response.body.message).toContain('already exists');
            });

            it('TC-CREATE-004: 잘못된 데이터 타입으로 생성 시 400 에러를 반환해야 함', async () => {
                // Given: 잘못된 타입의 데이터
                const invalidTypeData = {
                    name: 'John',
                    email: 'not-an-email', // 이메일 형식이 아님
                    age: 'thirty' // 숫자가 아님
                };

                // When: POST 요청을 보냄
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(invalidTypeData)
                    .expect(400);

                // Then: 타입 검증 에러가 반환되어야 함
                expect(response.body.details).toContain('email must be an email');
                expect(response.body.details).toContain('age must be a number');
            });

            it('TC-CREATE-005: 관계가 있는 엔티티를 생성해야 함', async () => {
                // Given: 카테고리와 함께 생성할 포스트 데이터
                const category = await createCategory({ name: 'Technology' });
                const postData = {
                    title: 'New Post',
                    content: 'Post content',
                    categoryId: category.id
                };

                // When: 관계를 포함한 포스트 생성
                const response = await request(app.getHttpServer())
                    .post('/posts')
                    .send(postData)
                    .expect(201);

                // Then: 관계가 올바르게 설정되어야 함
                expect(response.body.data.categoryId).toBe(category.id);
                expect(response.body.data.category).toBeDefined();
            });
        });

        describe('벌크 생성', () => {
            it('TC-CREATE-006: 여러 엔티티를 한 번에 생성해야 함', async () => {
                // Given: 여러 사용자 데이터
                const usersData = [
                    { name: 'User1', email: 'user1@example.com' },
                    { name: 'User2', email: 'user2@example.com' },
                    { name: 'User3', email: 'user3@example.com' }
                ];

                // When: 벌크 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users/bulk')
                    .send({ data: usersData })
                    .expect(201);

                // Then: 모든 엔티티가 생성되어야 함
                expect(response.body.data).toHaveLength(3);
                expect(response.body.total).toBe(3);
                expect(response.body.message).toBe('3 users created successfully');
            });

            it('TC-CREATE-007: 벌크 생성 중 일부 실패 시 트랜잭션이 롤백되어야 함', async () => {
                // Given: 일부 잘못된 데이터를 포함한 배열
                const mixedData = [
                    { name: 'Valid User', email: 'valid@example.com' },
                    { name: 'Invalid User' }, // email 누락
                    { name: 'Another Valid', email: 'another@example.com' }
                ];

                // When: 벌크 생성 시도
                const response = await request(app.getHttpServer())
                    .post('/users/bulk')
                    .send({ data: mixedData })
                    .expect(400);

                // Then: 아무것도 생성되지 않아야 함
                const count = await getUserCount();
                expect(count).toBe(0);
                expect(response.body.error).toContain('Bulk creation failed');
            });
        });
    });

    describe('READ Operations', () => {
        describe('단일 엔티티 조회', () => {
            it('TC-READ-001: ID로 엔티티를 조회해야 함', async () => {
                // Given: 생성된 사용자
                const user = await createUser({ name: 'John', email: 'john@example.com' });

                // When: GET 요청
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(200);

                // Then: 올바른 엔티티가 반환되어야 함
                expect(response.body.data.id).toBe(user.id);
                expect(response.body.data.name).toBe('John');
            });

            it('TC-READ-002: 존재하지 않는 ID로 조회 시 404 에러를 반환해야 함', async () => {
                // When: 존재하지 않는 ID로 조회
                const response = await request(app.getHttpServer())
                    .get('/users/99999')
                    .expect(404);

                // Then: Not Found 에러가 반환되어야 함
                expect(response.body.error).toBe('Not Found');
                expect(response.body.message).toContain('User not found');
            });

            it('TC-READ-003: 선택된 컬럼만 조회해야 함', async () => {
                // Given: 생성된 사용자
                const user = await createUser({ 
                    name: 'John', 
                    email: 'john@example.com',
                    password: 'secret123'
                });

                // When: 특정 컬럼만 선택하여 조회
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}?select=id,name,email`)
                    .expect(200);

                // Then: 선택된 컬럼만 반환되어야 함
                expect(response.body.data.id).toBeDefined();
                expect(response.body.data.name).toBeDefined();
                expect(response.body.data.email).toBeDefined();
                expect(response.body.data.password).toBeUndefined();
            });

            it('TC-READ-004: 제외된 컬럼은 반환하지 않아야 함', async () => {
                // Given: 생성된 사용자
                const user = await createUser({ 
                    name: 'John', 
                    email: 'john@example.com',
                    password: 'secret123'
                });

                // When: 특정 컬럼을 제외하고 조회
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}?exclude=password`)
                    .expect(200);

                // Then: 제외된 컬럼은 반환되지 않아야 함
                expect(response.body.data.password).toBeUndefined();
                expect(response.body.data.name).toBeDefined();
                expect(response.body.data.email).toBeDefined();
            });

            it('TC-READ-005: 관계를 포함하여 조회해야 함', async () => {
                // Given: 포스트와 카테고리
                const category = await createCategory({ name: 'Tech' });
                const post = await createPost({ 
                    title: 'Post', 
                    categoryId: category.id 
                });

                // When: 관계를 포함하여 조회
                const response = await request(app.getHttpServer())
                    .get(`/posts/${post.id}?include=category`)
                    .expect(200);

                // Then: 관계 데이터가 포함되어야 함
                expect(response.body.data.category).toBeDefined();
                expect(response.body.data.category.name).toBe('Tech');
            });
        });

        describe('목록 조회', () => {
            it('TC-READ-006: 전체 목록을 조회해야 함', async () => {
                // Given: 여러 사용자 생성
                await createUsers(5);

                // When: 목록 조회
                const response = await request(app.getHttpServer())
                    .get('/users')
                    .expect(200);

                // Then: 모든 사용자가 반환되어야 함
                expect(response.body.data).toHaveLength(5);
                expect(response.body.total).toBe(5);
            });

            it('TC-READ-007: 페이지네이션이 작동해야 함', async () => {
                // Given: 10명의 사용자 생성
                await createUsers(10);

                // When: 페이지 크기 3으로 두 번째 페이지 조회
                const response = await request(app.getHttpServer())
                    .get('/users?page=2&limit=3')
                    .expect(200);

                // Then: 올바른 페이지 데이터가 반환되어야 함
                expect(response.body.data).toHaveLength(3);
                expect(response.body.page).toBe(2);
                expect(response.body.limit).toBe(3);
                expect(response.body.total).toBe(10);
                expect(response.body.totalPages).toBe(4);
            });

            it('TC-READ-008: 커서 기반 페이지네이션이 작동해야 함', async () => {
                // Given: 정렬된 사용자 목록
                const users = await createUsersWithIds([1, 2, 3, 4, 5]);

                // When: 커서 기반 페이지네이션
                const response = await request(app.getHttpServer())
                    .get('/users?cursor=2&limit=2')
                    .expect(200);

                // Then: 커서 이후 데이터가 반환되어야 함
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data[0].id).toBe(3);
                expect(response.body.data[1].id).toBe(4);
                expect(response.body.nextCursor).toBe(4);
            });

            it('TC-READ-009: 필터링이 작동해야 함', async () => {
                // Given: 다양한 속성의 사용자들
                await createUser({ name: 'John', age: 25, status: 'active' });
                await createUser({ name: 'Jane', age: 30, status: 'active' });
                await createUser({ name: 'Bob', age: 35, status: 'inactive' });

                // When: 활성 사용자만 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?filter=status:eq:active')
                    .expect(200);

                // Then: 활성 사용자만 반환되어야 함
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.status === 'active')).toBe(true);
            });

            it('TC-READ-010: 복합 필터링이 작동해야 함', async () => {
                // Given: 다양한 사용자들
                await createUser({ name: 'John', age: 25, status: 'active' });
                await createUser({ name: 'Jane', age: 30, status: 'active' });
                await createUser({ name: 'Bob', age: 35, status: 'inactive' });
                await createUser({ name: 'Alice', age: 40, status: 'active' });

                // When: 나이가 30 이상이고 활성 상태인 사용자
                const response = await request(app.getHttpServer())
                    .get('/users?filter=age:gte:30,status:eq:active')
                    .expect(200);

                // Then: 조건에 맞는 사용자만 반환되어야 함
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data[0].name).toBe('Jane');
                expect(response.body.data[1].name).toBe('Alice');
            });

            it('TC-READ-011: 정렬이 작동해야 함', async () => {
                // Given: 순서가 뒤섞인 사용자들
                await createUser({ name: 'Charlie', age: 30 });
                await createUser({ name: 'Alice', age: 25 });
                await createUser({ name: 'Bob', age: 35 });

                // When: 이름순 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=name:asc')
                    .expect(200);

                // Then: 알파벳 순으로 정렬되어야 함
                expect(response.body.data[0].name).toBe('Alice');
                expect(response.body.data[1].name).toBe('Bob');
                expect(response.body.data[2].name).toBe('Charlie');
            });

            it('TC-READ-012: 다중 정렬이 작동해야 함', async () => {
                // Given: 복잡한 데이터
                await createUser({ name: 'Alice', age: 30, score: 85 });
                await createUser({ name: 'Bob', age: 25, score: 90 });
                await createUser({ name: 'Charlie', age: 30, score: 95 });
                await createUser({ name: 'David', age: 25, score: 80 });

                // When: 나이 오름차순, 점수 내림차순 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=age:asc,score:desc')
                    .expect(200);

                // Then: 올바른 순서로 정렬되어야 함
                expect(response.body.data[0].name).toBe('Bob'); // 25, 90
                expect(response.body.data[1].name).toBe('David'); // 25, 80
                expect(response.body.data[2].name).toBe('Charlie'); // 30, 95
                expect(response.body.data[3].name).toBe('Alice'); // 30, 85
            });

            it('TC-READ-013: 검색이 작동해야 함', async () => {
                // Given: 다양한 이름의 사용자들
                await createUser({ name: 'John Doe', email: 'john@example.com' });
                await createUser({ name: 'Jane Smith', email: 'jane@example.com' });
                await createUser({ name: 'Johnny Walker', email: 'johnny@example.com' });

                // When: "John"으로 검색
                const response = await request(app.getHttpServer())
                    .get('/users?search=John')
                    .expect(200);

                // Then: John이 포함된 사용자만 반환되어야 함
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.some(u => u.name === 'John Doe')).toBe(true);
                expect(response.body.data.some(u => u.name === 'Johnny Walker')).toBe(true);
            });
        });
    });

    describe('UPDATE Operations', () => {
        describe('단일 업데이트', () => {
            it('TC-UPDATE-001: 엔티티를 업데이트해야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John', email: 'john@example.com' });

                // When: 이름 업데이트
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'John Updated' })
                    .expect(200);

                // Then: 업데이트된 데이터가 반환되어야 함
                expect(response.body.data.name).toBe('John Updated');
                expect(response.body.data.email).toBe('john@example.com'); // 변경되지 않음
            });

            it('TC-UPDATE-002: 존재하지 않는 엔티티 업데이트 시 404 에러를 반환해야 함', async () => {
                // When: 존재하지 않는 ID로 업데이트 시도
                const response = await request(app.getHttpServer())
                    .patch('/users/99999')
                    .send({ name: 'Updated' })
                    .expect(404);

                // Then: Not Found 에러가 반환되어야 함
                expect(response.body.error).toBe('Not Found');
            });

            it('TC-UPDATE-003: 부분 업데이트가 작동해야 함', async () => {
                // Given: 여러 필드를 가진 사용자
                const user = await createUser({ 
                    name: 'John', 
                    email: 'john@example.com',
                    age: 30,
                    status: 'active'
                });

                // When: 일부 필드만 업데이트
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ age: 31 })
                    .expect(200);

                // Then: 업데이트된 필드만 변경되어야 함
                expect(response.body.data.age).toBe(31);
                expect(response.body.data.name).toBe('John');
                expect(response.body.data.email).toBe('john@example.com');
                expect(response.body.data.status).toBe('active');
            });

            it('TC-UPDATE-004: 잘못된 데이터로 업데이트 시 400 에러를 반환해야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John', email: 'john@example.com' });

                // When: 잘못된 이메일 형식으로 업데이트
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ email: 'not-an-email' })
                    .expect(400);

                // Then: 검증 에러가 반환되어야 함
                expect(response.body.error).toBe('Validation failed');
                expect(response.body.details).toContain('email must be an email');
            });

            it('TC-UPDATE-005: unique 제약 위반 시 409 에러를 반환해야 함', async () => {
                // Given: 두 명의 사용자
                const user1 = await createUser({ email: 'user1@example.com' });
                const user2 = await createUser({ email: 'user2@example.com' });

                // When: user2의 이메일을 user1과 동일하게 변경 시도
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user2.id}`)
                    .send({ email: 'user1@example.com' })
                    .expect(409);

                // Then: 충돌 에러가 반환되어야 함
                expect(response.body.error).toBe('Conflict');
            });
        });

        describe('벌크 업데이트', () => {
            it('TC-UPDATE-006: 여러 엔티티를 한 번에 업데이트해야 함', async () => {
                // Given: 여러 사용자
                const users = await createUsers(3);
                const ids = users.map(u => u.id);

                // When: 모든 사용자의 상태를 업데이트
                const response = await request(app.getHttpServer())
                    .patch('/users/bulk')
                    .send({ 
                        ids: ids,
                        data: { status: 'inactive' }
                    })
                    .expect(200);

                // Then: 모든 사용자가 업데이트되어야 함
                expect(response.body.affected).toBe(3);
                expect(response.body.message).toBe('3 users updated successfully');
            });

            it('TC-UPDATE-007: 조건부 벌크 업데이트가 작동해야 함', async () => {
                // Given: 다양한 상태의 사용자들
                await createUser({ name: 'User1', status: 'active', age: 25 });
                await createUser({ name: 'User2', status: 'active', age: 35 });
                await createUser({ name: 'User3', status: 'inactive', age: 30 });

                // When: 활성 사용자만 업데이트
                const response = await request(app.getHttpServer())
                    .patch('/users/bulk')
                    .send({ 
                        filter: { status: 'active' },
                        data: { verified: true }
                    })
                    .expect(200);

                // Then: 조건에 맞는 사용자만 업데이트되어야 함
                expect(response.body.affected).toBe(2);
            });
        });
    });

    describe('UPSERT Operations', () => {
        it('TC-UPSERT-001: 존재하지 않는 엔티티는 생성해야 함', async () => {
            // Given: 존재하지 않는 이메일
            const userData = {
                email: 'new@example.com',
                name: 'New User'
            };

            // When: Upsert 요청
            const response = await request(app.getHttpServer())
                .put('/users')
                .send(userData)
                .expect(201);

            // Then: 새 엔티티가 생성되어야 함
            expect(response.body.data.email).toBe('new@example.com');
            expect(response.body.data.name).toBe('New User');
            expect(response.body.created).toBe(true);
        });

        it('TC-UPSERT-002: 존재하는 엔티티는 업데이트해야 함', async () => {
            // Given: 기존 사용자
            const user = await createUser({ 
                email: 'existing@example.com',
                name: 'Existing User',
                age: 30
            });

            // When: 동일한 이메일로 Upsert
            const response = await request(app.getHttpServer())
                .put('/users')
                .send({
                    email: 'existing@example.com',
                    name: 'Updated Name',
                    age: 31
                })
                .expect(200);

            // Then: 기존 엔티티가 업데이트되어야 함
            expect(response.body.data.id).toBe(user.id);
            expect(response.body.data.name).toBe('Updated Name');
            expect(response.body.data.age).toBe(31);
            expect(response.body.created).toBe(false);
        });

        it('TC-UPSERT-003: 복합 키로 Upsert가 작동해야 함', async () => {
            // Given: 복합 키를 가진 엔티티
            const existing = await createUserRole({
                userId: 1,
                roleId: 2,
                assignedBy: 'admin'
            });

            // When: 동일한 복합 키로 Upsert
            const response = await request(app.getHttpServer())
                .put('/user-roles')
                .send({
                    userId: 1,
                    roleId: 2,
                    assignedBy: 'superadmin',
                    expiresAt: '2024-12-31'
                })
                .expect(200);

            // Then: 업데이트되어야 함
            expect(response.body.data.assignedBy).toBe('superadmin');
            expect(response.body.data.expiresAt).toBeDefined();
        });

        it('TC-UPSERT-004: 벌크 Upsert가 작동해야 함', async () => {
            // Given: 일부 존재하는 사용자들
            await createUser({ email: 'existing1@example.com', name: 'User1' });
            await createUser({ email: 'existing2@example.com', name: 'User2' });

            // When: 혼합된 데이터로 벌크 Upsert
            const response = await request(app.getHttpServer())
                .put('/users/bulk')
                .send({
                    data: [
                        { email: 'existing1@example.com', name: 'Updated1' }, // 업데이트
                        { email: 'existing2@example.com', name: 'Updated2' }, // 업데이트
                        { email: 'new@example.com', name: 'NewUser' } // 생성
                    ]
                })
                .expect(200);

            // Then: 적절히 생성/업데이트되어야 함
            expect(response.body.created).toBe(1);
            expect(response.body.updated).toBe(2);
            expect(response.body.total).toBe(3);
        });
    });

    describe('DELETE Operations', () => {
        describe('하드 삭제', () => {
            it('TC-DELETE-001: 엔티티를 완전히 삭제해야 함', async () => {
                // Given: 생성된 사용자
                const user = await createUser({ name: 'ToDelete' });

                // When: DELETE 요청
                const response = await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 삭제 확인 메시지가 반환되어야 함
                expect(response.body.message).toBe('User deleted successfully');
                
                // 다시 조회 시 404
                await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(404);
            });

            it('TC-DELETE-002: 존재하지 않는 엔티티 삭제 시 404 에러를 반환해야 함', async () => {
                // When: 존재하지 않는 ID로 삭제 시도
                const response = await request(app.getHttpServer())
                    .delete('/users/99999')
                    .expect(404);

                // Then: Not Found 에러가 반환되어야 함
                expect(response.body.error).toBe('Not Found');
            });

            it('TC-DELETE-003: 관계가 있는 엔티티 삭제 시 적절히 처리해야 함', async () => {
                // Given: 포스트가 있는 사용자
                const user = await createUser({ name: 'Author' });
                const post = await createPost({ 
                    title: 'Post',
                    authorId: user.id
                });

                // When: CASCADE 설정으로 사용자 삭제
                const response = await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 관련 포스트도 삭제되어야 함
                await request(app.getHttpServer())
                    .get(`/posts/${post.id}`)
                    .expect(404);
            });
        });

        describe('소프트 삭제', () => {
            it('TC-DELETE-004: 소프트 삭제가 작동해야 함', async () => {
                // Given: 소프트 삭제가 활성화된 엔티티
                const post = await createPost({ title: 'ToSoftDelete' });

                // When: 소프트 삭제
                const response = await request(app.getHttpServer())
                    .delete(`/posts/${post.id}`)
                    .expect(200);

                // Then: 삭제됨으로 표시되어야 함
                expect(response.body.message).toBe('Post soft deleted successfully');
                
                // 일반 조회 시 보이지 않음
                await request(app.getHttpServer())
                    .get(`/posts/${post.id}`)
                    .expect(404);
                
                // withDeleted 옵션으로는 조회 가능
                const deletedResponse = await request(app.getHttpServer())
                    .get(`/posts/${post.id}?withDeleted=true`)
                    .expect(200);
                
                expect(deletedResponse.body.data.deletedAt).toBeDefined();
            });

            it('TC-DELETE-005: 소프트 삭제된 엔티티를 복구해야 함', async () => {
                // Given: 소프트 삭제된 포스트
                const post = await createPost({ title: 'ToRecover' });
                await softDeletePost(post.id);

                // When: 복구 요청
                const response = await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(200);

                // Then: 복구되어야 함
                expect(response.body.message).toBe('Post recovered successfully');
                
                // 일반 조회 가능
                const recoveredResponse = await request(app.getHttpServer())
                    .get(`/posts/${post.id}`)
                    .expect(200);
                
                expect(recoveredResponse.body.data.deletedAt).toBeNull();
            });

            it('TC-DELETE-006: 이미 삭제된 엔티티 재삭제 시 404 에러를 반환해야 함', async () => {
                // Given: 소프트 삭제된 포스트
                const post = await createPost({ title: 'AlreadyDeleted' });
                await softDeletePost(post.id);

                // When: 다시 삭제 시도
                const response = await request(app.getHttpServer())
                    .delete(`/posts/${post.id}`)
                    .expect(404);

                // Then: Not Found 에러가 반환되어야 함
                expect(response.body.error).toBe('Not Found');
            });
        });

        describe('벌크 삭제', () => {
            it('TC-DELETE-007: 여러 엔티티를 한 번에 삭제해야 함', async () => {
                // Given: 여러 사용자
                const users = await createUsers(5);
                const ids = users.map(u => u.id);

                // When: 벌크 삭제
                const response = await request(app.getHttpServer())
                    .delete('/users/bulk')
                    .send({ ids: ids })
                    .expect(200);

                // Then: 모두 삭제되어야 함
                expect(response.body.deleted).toBe(5);
                expect(response.body.message).toBe('5 users deleted successfully');
            });

            it('TC-DELETE-008: 조건부 벌크 삭제가 작동해야 함', async () => {
                // Given: 다양한 상태의 사용자들
                await createUser({ name: 'Active1', status: 'active' });
                await createUser({ name: 'Active2', status: 'active' });
                await createUser({ name: 'Inactive1', status: 'inactive' });
                await createUser({ name: 'Inactive2', status: 'inactive' });

                // When: 비활성 사용자만 삭제
                const response = await request(app.getHttpServer())
                    .delete('/users/bulk')
                    .send({ filter: { status: 'inactive' } })
                    .expect(200);

                // Then: 조건에 맞는 사용자만 삭제되어야 함
                expect(response.body.deleted).toBe(2);
                
                // 활성 사용자는 남아있어야 함
                const remaining = await request(app.getHttpServer())
                    .get('/users')
                    .expect(200);
                
                expect(remaining.body.data).toHaveLength(2);
                expect(remaining.body.data.every(u => u.status === 'active')).toBe(true);
            });
        });
    });

    describe('복구 Operations', () => {
        it('TC-RECOVER-001: 소프트 삭제된 단일 엔티티를 복구해야 함', async () => {
            // Given: 소프트 삭제된 포스트
            const post = await createPost({ title: 'Deleted Post' });
            await softDeletePost(post.id);

            // When: 복구 요청
            const response = await request(app.getHttpServer())
                .post(`/posts/${post.id}/recover`)
                .expect(200);

            // Then: 복구되어야 함
            expect(response.body.data.deletedAt).toBeNull();
            expect(response.body.message).toBe('Post recovered successfully');
        });

        it('TC-RECOVER-002: 삭제되지 않은 엔티티 복구 시 400 에러를 반환해야 함', async () => {
            // Given: 정상 포스트
            const post = await createPost({ title: 'Normal Post' });

            // When: 복구 시도
            const response = await request(app.getHttpServer())
                .post(`/posts/${post.id}/recover`)
                .expect(400);

            // Then: 에러가 반환되어야 함
            expect(response.body.error).toBe('Bad Request');
            expect(response.body.message).toContain('not deleted');
        });

        it('TC-RECOVER-003: 벌크 복구가 작동해야 함', async () => {
            // Given: 여러 소프트 삭제된 포스트
            const posts = await createPosts(3);
            for (const post of posts) {
                await softDeletePost(post.id);
            }

            // When: 벌크 복구
            const response = await request(app.getHttpServer())
                .post('/posts/bulk/recover')
                .send({ ids: posts.map(p => p.id) })
                .expect(200);

            // Then: 모두 복구되어야 함
            expect(response.body.recovered).toBe(3);
            expect(response.body.message).toBe('3 posts recovered successfully');
        });

        it('TC-RECOVER-004: 조건부 벌크 복구가 작동해야 함', async () => {
            // Given: 다양한 시점에 삭제된 포스트들
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);

            await createAndSoftDeletePost({ title: 'Recent1', deletedAt: yesterday });
            await createAndSoftDeletePost({ title: 'Recent2', deletedAt: yesterday });
            await createAndSoftDeletePost({ title: 'Old1', deletedAt: lastWeek });

            // When: 최근 삭제된 것만 복구
            const response = await request(app.getHttpServer())
                .post('/posts/bulk/recover')
                .send({ 
                    filter: { 
                        deletedAt: { $gte: yesterday } 
                    } 
                })
                .expect(200);

            // Then: 조건에 맞는 것만 복구되어야 함
            expect(response.body.recovered).toBe(2);
        });
    });
});

// Helper functions
async function createUser(data: any) {
    // 사용자 생성 헬퍼
}

async function createUsers(count: number) {
    // 여러 사용자 생성 헬퍼
}

async function createCategory(data: any) {
    // 카테고리 생성 헬퍼
}

async function createPost(data: any) {
    // 포스트 생성 헬퍼
}

async function softDeletePost(id: number) {
    // 포스트 소프트 삭제 헬퍼
}

async function getUserCount() {
    // 사용자 수 조회 헬퍼
}