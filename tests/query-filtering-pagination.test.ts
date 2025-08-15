/**
 * Query Parsing, Filtering, and Pagination Test Cases
 * 
 * 이 테스트는 NestJS CRUD 패키지의 쿼리 파싱, 필터링, 페이지네이션 기능을 검증합니다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Query Parsing, Filtering, and Pagination', () => {
    let app: INestApplication;

    beforeEach(async () => {
        // 테스트 환경 설정
    });

    afterEach(async () => {
        await app?.close();
    });

    describe('Query Parsing', () => {
        describe('기본 쿼리 파싱', () => {
            it('TC-QUERY-001: 단순 쿼리 파라미터를 파싱해야 함', async () => {
                // Given: 테스트 데이터
                await createUsers([
                    { name: 'John', age: 25 },
                    { name: 'Jane', age: 30 }
                ]);

                // When: 쿼리 파라미터로 요청
                const response = await request(app.getHttpServer())
                    .get('/users?name=John')
                    .expect(200);

                // Then: 필터링된 결과가 반환되어야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('John');
            });

            it('TC-QUERY-002: 여러 쿼리 파라미터를 AND 조건으로 파싱해야 함', async () => {
                // Given: 다양한 사용자들
                await createUsers([
                    { name: 'John', age: 25, status: 'active' },
                    { name: 'John', age: 30, status: 'inactive' },
                    { name: 'Jane', age: 25, status: 'active' }
                ]);

                // When: 여러 조건으로 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?name=John&status=active')
                    .expect(200);

                // Then: 모든 조건을 만족하는 결과만 반환되어야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0]).toMatchObject({
                    name: 'John',
                    age: 25,
                    status: 'active'
                });
            });

            it('TC-QUERY-003: 배열 형태의 쿼리 파라미터를 파싱해야 함', async () => {
                // Given: 여러 ID를 가진 사용자들
                await createUsers([
                    { id: 1, name: 'User1' },
                    { id: 2, name: 'User2' },
                    { id: 3, name: 'User3' },
                    { id: 4, name: 'User4' }
                ]);

                // When: 배열로 ID 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?id[]=1&id[]=3')
                    .expect(200);

                // Then: 지정된 ID들만 반환되어야 함
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.map(u => u.id)).toEqual([1, 3]);
            });

            it('TC-QUERY-004: 중첩된 객체의 필드를 파싱해야 함', async () => {
                // Given: 프로필을 가진 사용자들
                await createUsers([
                    { name: 'John', profile: { city: 'Seoul' } },
                    { name: 'Jane', profile: { city: 'Busan' } }
                ]);

                // When: 중첩 필드로 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?profile.city=Seoul')
                    .expect(200);

                // Then: 중첩 조건을 만족하는 결과가 반환되어야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('John');
            });

            it('TC-QUERY-005: 특수 문자가 포함된 값을 올바르게 파싱해야 함', async () => {
                // Given: 특수 문자를 포함한 이메일
                await createUsers([
                    { email: 'user+test@example.com' },
                    { email: 'user@example.com' }
                ]);

                // When: URL 인코딩된 값으로 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?email=' + encodeURIComponent('user+test@example.com'))
                    .expect(200);

                // Then: 올바르게 필터링되어야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].email).toBe('user+test@example.com');
            });
        });

        describe('고급 쿼리 연산자', () => {
            it('TC-QUERY-006: $eq (equal) 연산자가 작동해야 함', async () => {
                // Given: 테스트 데이터
                await createUsers([
                    { name: 'John', age: 25 },
                    { name: 'Jane', age: 30 }
                ]);

                // When: $eq 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=age:eq:25')
                    .expect(200);

                // Then: 정확히 일치하는 결과만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].age).toBe(25);
            });

            it('TC-QUERY-007: $ne (not equal) 연산자가 작동해야 함', async () => {
                // Given: 테스트 데이터
                await createUsers([
                    { status: 'active' },
                    { status: 'inactive' },
                    { status: 'pending' }
                ]);

                // When: $ne 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=status:ne:inactive')
                    .expect(200);

                // Then: 일치하지 않는 결과만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.status !== 'inactive')).toBe(true);
            });

            it('TC-QUERY-008: $gt (greater than) 연산자가 작동해야 함', async () => {
                // Given: 다양한 나이의 사용자들
                await createUsers([
                    { name: 'User1', age: 20 },
                    { name: 'User2', age: 25 },
                    { name: 'User3', age: 30 },
                    { name: 'User4', age: 35 }
                ]);

                // When: $gt 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=age:gt:25')
                    .expect(200);

                // Then: 25보다 큰 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.age > 25)).toBe(true);
            });

            it('TC-QUERY-009: $gte (greater than or equal) 연산자가 작동해야 함', async () => {
                // Given: 다양한 나이의 사용자들
                await createUsers([
                    { name: 'User1', age: 20 },
                    { name: 'User2', age: 25 },
                    { name: 'User3', age: 30 }
                ]);

                // When: $gte 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=age:gte:25')
                    .expect(200);

                // Then: 25 이상의 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.age >= 25)).toBe(true);
            });

            it('TC-QUERY-010: $lt (less than) 연산자가 작동해야 함', async () => {
                // Given: 다양한 점수의 사용자들
                await createUsers([
                    { name: 'User1', score: 60 },
                    { name: 'User2', score: 75 },
                    { name: 'User3', score: 90 }
                ]);

                // When: $lt 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=score:lt:75')
                    .expect(200);

                // Then: 75보다 작은 값만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].score).toBe(60);
            });

            it('TC-QUERY-011: $lte (less than or equal) 연산자가 작동해야 함', async () => {
                // Given: 다양한 점수의 사용자들
                await createUsers([
                    { name: 'User1', score: 60 },
                    { name: 'User2', score: 75 },
                    { name: 'User3', score: 90 }
                ]);

                // When: $lte 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=score:lte:75')
                    .expect(200);

                // Then: 75 이하의 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.score <= 75)).toBe(true);
            });

            it('TC-QUERY-012: $in 연산자가 작동해야 함', async () => {
                // Given: 다양한 상태의 사용자들
                await createUsers([
                    { name: 'User1', status: 'active' },
                    { name: 'User2', status: 'inactive' },
                    { name: 'User3', status: 'pending' },
                    { name: 'User4', status: 'suspended' }
                ]);

                // When: $in 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=status:in:active,pending')
                    .expect(200);

                // Then: 지정된 값 중 하나와 일치하는 결과만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => 
                    ['active', 'pending'].includes(u.status)
                )).toBe(true);
            });

            it('TC-QUERY-013: $nin (not in) 연산자가 작동해야 함', async () => {
                // Given: 다양한 역할의 사용자들
                await createUsers([
                    { name: 'User1', role: 'admin' },
                    { name: 'User2', role: 'user' },
                    { name: 'User3', role: 'moderator' },
                    { name: 'User4', role: 'guest' }
                ]);

                // When: $nin 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=role:nin:admin,moderator')
                    .expect(200);

                // Then: 지정된 값과 일치하지 않는 결과만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => 
                    !['admin', 'moderator'].includes(u.role)
                )).toBe(true);
            });

            it('TC-QUERY-014: $like 연산자가 작동해야 함', async () => {
                // Given: 다양한 이름의 사용자들
                await createUsers([
                    { name: 'John Doe' },
                    { name: 'Johnny Walker' },
                    { name: 'Jane Smith' },
                    { name: 'Bob Johnson' }
                ]);

                // When: $like 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=name:like:John%')
                    .expect(200);

                // Then: 패턴과 일치하는 결과만 반환
                expect(response.body.data).toHaveLength(3);
                expect(response.body.data.every(u => 
                    u.name.includes('John')
                )).toBe(true);
            });

            it('TC-QUERY-015: $ilike (case-insensitive like) 연산자가 작동해야 함', async () => {
                // Given: 다양한 대소문자의 이름들
                await createUsers([
                    { name: 'JOHN DOE' },
                    { name: 'john smith' },
                    { name: 'Jane Doe' },
                    { name: 'Bob Johnson' }
                ]);

                // When: $ilike 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=name:ilike:%john%')
                    .expect(200);

                // Then: 대소문자 구분 없이 패턴과 일치하는 결과 반환
                expect(response.body.data).toHaveLength(3);
            });

            it('TC-QUERY-016: $between 연산자가 작동해야 함', async () => {
                // Given: 다양한 나이의 사용자들
                await createUsers([
                    { name: 'User1', age: 18 },
                    { name: 'User2', age: 25 },
                    { name: 'User3', age: 30 },
                    { name: 'User4', age: 40 }
                ]);

                // When: $between 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=age:between:20,30')
                    .expect(200);

                // Then: 범위 내의 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => 
                    u.age >= 20 && u.age <= 30
                )).toBe(true);
            });

            it('TC-QUERY-017: $isNull 연산자가 작동해야 함', async () => {
                // Given: deletedAt이 있거나 없는 사용자들
                await createUsers([
                    { name: 'Active1', deletedAt: null },
                    { name: 'Active2', deletedAt: null },
                    { name: 'Deleted1', deletedAt: new Date() }
                ]);

                // When: $isNull 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=deletedAt:isNull:true')
                    .expect(200);

                // Then: null 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.deletedAt === null)).toBe(true);
            });

            it('TC-QUERY-018: $isNotNull 연산자가 작동해야 함', async () => {
                // Given: 프로필이 있거나 없는 사용자들
                await createUsers([
                    { name: 'User1', profileId: 1 },
                    { name: 'User2', profileId: null },
                    { name: 'User3', profileId: 3 }
                ]);

                // When: $isNotNull 연산자 사용
                const response = await request(app.getHttpServer())
                    .get('/users?filter=profileId:isNotNull:true')
                    .expect(200);

                // Then: null이 아닌 값만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.profileId !== null)).toBe(true);
            });
        });

        describe('복합 필터링', () => {
            it('TC-QUERY-019: OR 조건으로 필터링할 수 있어야 함', async () => {
                // Given: 다양한 사용자들
                await createUsers([
                    { name: 'John', age: 25 },
                    { name: 'Jane', age: 30 },
                    { name: 'Bob', age: 35 }
                ]);

                // When: OR 조건 사용
                const response = await request(app.getHttpServer())
                    .get('/users?$or=name:eq:John,age:gte:30')
                    .expect(200);

                // Then: OR 조건 중 하나라도 만족하는 결과 반환
                expect(response.body.data).toHaveLength(3);
            });

            it('TC-QUERY-020: AND와 OR을 조합하여 필터링할 수 있어야 함', async () => {
                // Given: 복잡한 조건의 데이터
                await createUsers([
                    { name: 'John', age: 25, status: 'active' },
                    { name: 'John', age: 30, status: 'inactive' },
                    { name: 'Jane', age: 25, status: 'active' },
                    { name: 'Bob', age: 35, status: 'active' }
                ]);

                // When: 복합 조건 사용
                // status='active' AND (name='John' OR age>=30)
                const response = await request(app.getHttpServer())
                    .get('/users?filter=status:eq:active&$or=name:eq:John,age:gte:30')
                    .expect(200);

                // Then: 복합 조건을 만족하는 결과만 반환
                expect(response.body.data).toHaveLength(2);
            });

            it('TC-QUERY-021: 중첩된 OR 조건을 처리할 수 있어야 함', async () => {
                // Given: 복잡한 데이터
                await createUsers([
                    { name: 'John', role: 'admin', department: 'IT' },
                    { name: 'Jane', role: 'user', department: 'HR' },
                    { name: 'Bob', role: 'moderator', department: 'IT' },
                    { name: 'Alice', role: 'user', department: 'Finance' }
                ]);

                // When: 중첩된 조건
                // (role='admin' OR role='moderator') AND department='IT'
                const response = await request(app.getHttpServer())
                    .get('/users?filter=department:eq:IT&$or=role:eq:admin,role:eq:moderator')
                    .expect(200);

                // Then: 조건을 만족하는 결과 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(u => u.department === 'IT')).toBe(true);
            });
        });
    });

    describe('Filtering', () => {
        describe('허용된 필터', () => {
            it('TC-FILTER-001: allowedFilters에 정의된 필드만 필터링 가능해야 함', async () => {
                // Given: allowedFilters = ['name', 'age']
                await createUsers([
                    { name: 'John', age: 25, salary: 50000 },
                    { name: 'Jane', age: 30, salary: 60000 }
                ]);

                // When: 허용되지 않은 필드로 필터링 시도
                const response = await request(app.getHttpServer())
                    .get('/restricted-users?filter=salary:gt:55000')
                    .expect(400);

                // Then: 에러가 반환되어야 함
                expect(response.body.error).toContain('Filter not allowed');
                expect(response.body.details).toContain('salary');
            });

            it('TC-FILTER-002: 허용된 필터는 정상 작동해야 함', async () => {
                // Given: allowedFilters = ['name', 'age']
                await createUsers([
                    { name: 'John', age: 25 },
                    { name: 'Jane', age: 30 }
                ]);

                // When: 허용된 필드로 필터링
                const response = await request(app.getHttpServer())
                    .get('/restricted-users?filter=age:gte:30')
                    .expect(200);

                // Then: 필터링된 결과가 반환되어야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('Jane');
            });

            it('TC-FILTER-003: 와일드카드 필터가 작동해야 함', async () => {
                // Given: allowedFilters = ['profile.*']
                await createUsers([
                    { name: 'John', profile: { city: 'Seoul', age: 25 } },
                    { name: 'Jane', profile: { city: 'Busan', age: 30 } }
                ]);

                // When: 와일드카드로 허용된 중첩 필드 필터링
                const response = await request(app.getHttpServer())
                    .get('/wildcard-users?filter=profile.city:eq:Seoul')
                    .expect(200);

                // Then: 필터링이 작동해야 함
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('John');
            });
        });

        describe('날짜 필터링', () => {
            it('TC-FILTER-004: 날짜 범위로 필터링할 수 있어야 함', async () => {
                // Given: 다양한 생성일의 사용자들
                await createUsers([
                    { name: 'User1', createdAt: '2024-01-01' },
                    { name: 'User2', createdAt: '2024-02-15' },
                    { name: 'User3', createdAt: '2024-03-30' }
                ]);

                // When: 날짜 범위 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?filter=createdAt:between:2024-01-15,2024-03-15')
                    .expect(200);

                // Then: 범위 내의 데이터만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('User2');
            });

            it('TC-FILTER-005: 상대적 날짜로 필터링할 수 있어야 함', async () => {
                // Given: 최근 생성된 사용자들
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const lastWeek = new Date(today);
                lastWeek.setDate(lastWeek.getDate() - 7);

                await createUsers([
                    { name: 'Today', createdAt: today },
                    { name: 'Yesterday', createdAt: yesterday },
                    { name: 'LastWeek', createdAt: lastWeek }
                ]);

                // When: 최근 3일 이내 데이터 조회
                const response = await request(app.getHttpServer())
                    .get('/users?filter=createdAt:gte:$-3days')
                    .expect(200);

                // Then: 최근 데이터만 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.map(u => u.name)).toContain('Today');
                expect(response.body.data.map(u => u.name)).toContain('Yesterday');
            });
        });

        describe('관계 필터링', () => {
            it('TC-FILTER-006: 1:1 관계로 필터링할 수 있어야 함', async () => {
                // Given: 프로필을 가진 사용자들
                await createUsersWithProfiles([
                    { name: 'John', profile: { bio: 'Developer' } },
                    { name: 'Jane', profile: { bio: 'Designer' } }
                ]);

                // When: 프로필 정보로 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?filter=profile.bio:like:%Developer%')
                    .expect(200);

                // Then: 조건에 맞는 사용자만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('John');
            });

            it('TC-FILTER-007: 1:N 관계로 필터링할 수 있어야 함', async () => {
                // Given: 포스트를 가진 사용자들
                const user1 = await createUser({ name: 'Author1' });
                const user2 = await createUser({ name: 'Author2' });
                await createPost({ title: 'Tech Post', authorId: user1.id });
                await createPost({ title: 'Life Post', authorId: user2.id });

                // When: 포스트 제목으로 사용자 필터링
                const response = await request(app.getHttpServer())
                    .get('/users?filter=posts.title:like:%Tech%')
                    .expect(200);

                // Then: Tech 포스트를 가진 사용자만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].name).toBe('Author1');
            });

            it('TC-FILTER-008: N:N 관계로 필터링할 수 있어야 함', async () => {
                // Given: 태그를 가진 포스트들
                const tag1 = await createTag({ name: 'JavaScript' });
                const tag2 = await createTag({ name: 'Python' });
                const post1 = await createPost({ title: 'Post1' });
                const post2 = await createPost({ title: 'Post2' });
                await addTagToPost(post1.id, tag1.id);
                await addTagToPost(post2.id, tag2.id);

                // When: 태그로 포스트 필터링
                const response = await request(app.getHttpServer())
                    .get('/posts?filter=tags.name:eq:JavaScript')
                    .expect(200);

                // Then: JavaScript 태그를 가진 포스트만 반환
                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].title).toBe('Post1');
            });
        });
    });

    describe('Pagination', () => {
        describe('오프셋 기반 페이지네이션', () => {
            it('TC-PAGE-001: 기본 페이지네이션이 작동해야 함', async () => {
                // Given: 20개의 사용자
                await createUsers(20);

                // When: 첫 페이지 조회 (기본 10개)
                const response = await request(app.getHttpServer())
                    .get('/users?page=1')
                    .expect(200);

                // Then: 페이지 정보가 올바르게 반환되어야 함
                expect(response.body.data).toHaveLength(10);
                expect(response.body.page).toBe(1);
                expect(response.body.limit).toBe(10);
                expect(response.body.total).toBe(20);
                expect(response.body.totalPages).toBe(2);
            });

            it('TC-PAGE-002: 페이지 크기를 지정할 수 있어야 함', async () => {
                // Given: 15개의 사용자
                await createUsers(15);

                // When: 페이지 크기 5로 조회
                const response = await request(app.getHttpServer())
                    .get('/users?page=2&limit=5')
                    .expect(200);

                // Then: 지정된 크기로 페이지네이션
                expect(response.body.data).toHaveLength(5);
                expect(response.body.page).toBe(2);
                expect(response.body.limit).toBe(5);
                expect(response.body.totalPages).toBe(3);
            });

            it('TC-PAGE-003: 마지막 페이지가 부분적으로 채워져야 함', async () => {
                // Given: 13개의 사용자
                await createUsers(13);

                // When: 마지막 페이지 조회 (limit=5)
                const response = await request(app.getHttpServer())
                    .get('/users?page=3&limit=5')
                    .expect(200);

                // Then: 남은 데이터만 반환
                expect(response.body.data).toHaveLength(3);
                expect(response.body.page).toBe(3);
                expect(response.body.isLastPage).toBe(true);
            });

            it('TC-PAGE-004: 범위를 벗어난 페이지 요청 시 빈 결과를 반환해야 함', async () => {
                // Given: 10개의 사용자
                await createUsers(10);

                // When: 존재하지 않는 페이지 요청
                const response = await request(app.getHttpServer())
                    .get('/users?page=5&limit=10')
                    .expect(200);

                // Then: 빈 결과 반환
                expect(response.body.data).toHaveLength(0);
                expect(response.body.page).toBe(5);
                expect(response.body.total).toBe(10);
            });

            it('TC-PAGE-005: 최대 페이지 크기 제한이 작동해야 함', async () => {
                // Given: 200개의 사용자
                await createUsers(200);

                // When: 과도한 limit 요청
                const response = await request(app.getHttpServer())
                    .get('/users?limit=1000')
                    .expect(200);

                // Then: 최대 크기로 제한
                expect(response.body.data.length).toBeLessThanOrEqual(100); // 최대 100
                expect(response.body.limit).toBe(100);
            });
        });

        describe('커서 기반 페이지네이션', () => {
            it('TC-PAGE-006: 커서 기반 페이지네이션이 작동해야 함', async () => {
                // Given: ID가 순차적인 사용자들
                await createUsersWithIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

                // When: 커서 5 이후 3개 조회
                const response = await request(app.getHttpServer())
                    .get('/users?cursor=5&limit=3&paginationType=cursor')
                    .expect(200);

                // Then: 커서 이후 데이터만 반환
                expect(response.body.data).toHaveLength(3);
                expect(response.body.data[0].id).toBe(6);
                expect(response.body.data[2].id).toBe(8);
                expect(response.body.nextCursor).toBe(8);
                expect(response.body.hasMore).toBe(true);
            });

            it('TC-PAGE-007: 마지막 커서에서 hasMore가 false여야 함', async () => {
                // Given: 5개의 사용자
                await createUsersWithIds([1, 2, 3, 4, 5]);

                // When: 커서 3 이후 나머지 조회
                const response = await request(app.getHttpServer())
                    .get('/users?cursor=3&limit=10&paginationType=cursor')
                    .expect(200);

                // Then: 남은 데이터와 hasMore=false
                expect(response.body.data).toHaveLength(2);
                expect(response.body.hasMore).toBe(false);
                expect(response.body.nextCursor).toBe(5);
            });

            it('TC-PAGE-008: 커서와 정렬을 함께 사용할 수 있어야 함', async () => {
                // Given: 이름순으로 정렬된 사용자들
                await createUsers([
                    { id: 1, name: 'Alice' },
                    { id: 2, name: 'Bob' },
                    { id: 3, name: 'Charlie' },
                    { id: 4, name: 'David' },
                    { id: 5, name: 'Eve' }
                ]);

                // When: 이름순 정렬 + 커서
                const response = await request(app.getHttpServer())
                    .get('/users?cursor=Bob&limit=2&sort=name:asc&paginationType=cursor')
                    .expect(200);

                // Then: Bob 이후 이름순으로 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data[0].name).toBe('Charlie');
                expect(response.body.data[1].name).toBe('David');
            });

            it('TC-PAGE-009: 복합 커서가 작동해야 함', async () => {
                // Given: 복합 정렬 기준의 데이터
                await createUsers([
                    { score: 100, id: 1 },
                    { score: 100, id: 2 },
                    { score: 90, id: 3 },
                    { score: 90, id: 4 },
                    { score: 80, id: 5 }
                ]);

                // When: score DESC, id ASC로 정렬 후 커서
                const response = await request(app.getHttpServer())
                    .get('/users?cursor=score:100,id:1&limit=2&sort=score:desc,id:asc&paginationType=cursor')
                    .expect(200);

                // Then: 복합 커서 이후 데이터 반환
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data[0]).toMatchObject({ score: 100, id: 2 });
                expect(response.body.data[1]).toMatchObject({ score: 90, id: 3 });
            });
        });

        describe('무한 스크롤 페이지네이션', () => {
            it('TC-PAGE-010: 무한 스크롤용 next 페이지네이션이 작동해야 함', async () => {
                // Given: 많은 포스트
                await createPosts(50);

                // When: 첫 페이지 조회
                const firstPage = await request(app.getHttpServer())
                    .get('/posts?limit=10&paginationType=next')
                    .expect(200);

                // Then: next 정보가 포함되어야 함
                expect(firstPage.body.data).toHaveLength(10);
                expect(firstPage.body.next).toBeDefined();
                expect(firstPage.body.hasMore).toBe(true);

                // When: next로 다음 페이지 조회
                const secondPage = await request(app.getHttpServer())
                    .get(`/posts?next=${firstPage.body.next}&limit=10&paginationType=next`)
                    .expect(200);

                // Then: 다음 페이지 데이터 반환
                expect(secondPage.body.data).toHaveLength(10);
                expect(secondPage.body.data[0].id).not.toBe(firstPage.body.data[0].id);
            });

            it('TC-PAGE-011: 필터와 함께 무한 스크롤이 작동해야 함', async () => {
                // Given: 다양한 카테고리의 포스트
                await createPosts([
                    { category: 'tech' },
                    { category: 'tech' },
                    { category: 'life' },
                    { category: 'tech' },
                    { category: 'tech' }
                ]);

                // When: 필터링된 첫 페이지
                const response = await request(app.getHttpServer())
                    .get('/posts?filter=category:eq:tech&limit=2&paginationType=next')
                    .expect(200);

                // Then: 필터링된 결과의 페이지네이션
                expect(response.body.data).toHaveLength(2);
                expect(response.body.data.every(p => p.category === 'tech')).toBe(true);
                expect(response.body.hasMore).toBe(true);
            });
        });
    });

    describe('Sorting', () => {
        describe('단일 필드 정렬', () => {
            it('TC-SORT-001: 오름차순 정렬이 작동해야 함', async () => {
                // Given: 순서가 뒤섞인 사용자들
                await createUsers([
                    { name: 'Charlie', age: 30 },
                    { name: 'Alice', age: 25 },
                    { name: 'Bob', age: 35 }
                ]);

                // When: 이름 오름차순 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=name:asc')
                    .expect(200);

                // Then: 알파벳 순으로 정렬
                expect(response.body.data[0].name).toBe('Alice');
                expect(response.body.data[1].name).toBe('Bob');
                expect(response.body.data[2].name).toBe('Charlie');
            });

            it('TC-SORT-002: 내림차순 정렬이 작동해야 함', async () => {
                // Given: 다양한 나이의 사용자들
                await createUsers([
                    { name: 'User1', age: 25 },
                    { name: 'User2', age: 35 },
                    { name: 'User3', age: 30 }
                ]);

                // When: 나이 내림차순 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=age:desc')
                    .expect(200);

                // Then: 나이가 많은 순으로 정렬
                expect(response.body.data[0].age).toBe(35);
                expect(response.body.data[1].age).toBe(30);
                expect(response.body.data[2].age).toBe(25);
            });

            it('TC-SORT-003: NULL 값 처리가 올바르게 되어야 함', async () => {
                // Given: NULL 값을 포함한 데이터
                await createUsers([
                    { name: 'User1', score: 80 },
                    { name: 'User2', score: null },
                    { name: 'User3', score: 90 },
                    { name: 'User4', score: null }
                ]);

                // When: score 오름차순 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=score:asc')
                    .expect(200);

                // Then: NULL이 먼저 또는 마지막에 위치
                expect(response.body.data[0].score).toBeNull();
                expect(response.body.data[1].score).toBeNull();
                expect(response.body.data[2].score).toBe(80);
                expect(response.body.data[3].score).toBe(90);
            });
        });

        describe('다중 필드 정렬', () => {
            it('TC-SORT-004: 다중 필드 정렬이 작동해야 함', async () => {
                // Given: 복합 정렬이 필요한 데이터
                await createUsers([
                    { department: 'IT', name: 'Charlie', age: 30 },
                    { department: 'HR', name: 'Alice', age: 25 },
                    { department: 'IT', name: 'Alice', age: 35 },
                    { department: 'HR', name: 'Bob', age: 30 }
                ]);

                // When: department ASC, name ASC 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=department:asc,name:asc')
                    .expect(200);

                // Then: 부서별, 이름순 정렬
                expect(response.body.data[0]).toMatchObject({ department: 'HR', name: 'Alice' });
                expect(response.body.data[1]).toMatchObject({ department: 'HR', name: 'Bob' });
                expect(response.body.data[2]).toMatchObject({ department: 'IT', name: 'Alice' });
                expect(response.body.data[3]).toMatchObject({ department: 'IT', name: 'Charlie' });
            });

            it('TC-SORT-005: 3개 이상의 필드로 정렬할 수 있어야 함', async () => {
                // Given: 복잡한 정렬이 필요한 데이터
                await createUsers([
                    { category: 'A', priority: 1, score: 90, name: 'User1' },
                    { category: 'A', priority: 1, score: 80, name: 'User2' },
                    { category: 'A', priority: 2, score: 95, name: 'User3' },
                    { category: 'B', priority: 1, score: 85, name: 'User4' }
                ]);

                // When: 3단계 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=category:asc,priority:asc,score:desc')
                    .expect(200);

                // Then: 올바른 순서로 정렬
                expect(response.body.data[0].name).toBe('User1'); // A, 1, 90
                expect(response.body.data[1].name).toBe('User2'); // A, 1, 80
                expect(response.body.data[2].name).toBe('User3'); // A, 2, 95
                expect(response.body.data[3].name).toBe('User4'); // B, 1, 85
            });
        });

        describe('관계 필드 정렬', () => {
            it('TC-SORT-006: 관계 필드로 정렬할 수 있어야 함', async () => {
                // Given: 카테고리를 가진 포스트들
                const catA = await createCategory({ name: 'A-Category' });
                const catB = await createCategory({ name: 'B-Category' });
                await createPost({ title: 'Post1', categoryId: catB.id });
                await createPost({ title: 'Post2', categoryId: catA.id });
                await createPost({ title: 'Post3', categoryId: catB.id });

                // When: 카테고리 이름으로 정렬
                const response = await request(app.getHttpServer())
                    .get('/posts?sort=category.name:asc&include=category')
                    .expect(200);

                // Then: 카테고리 이름순으로 정렬
                expect(response.body.data[0].category.name).toBe('A-Category');
                expect(response.body.data[1].category.name).toBe('B-Category');
                expect(response.body.data[2].category.name).toBe('B-Category');
            });

            it('TC-SORT-007: 집계 필드로 정렬할 수 있어야 함', async () => {
                // Given: 포스트 수가 다른 사용자들
                const user1 = await createUser({ name: 'User1' });
                const user2 = await createUser({ name: 'User2' });
                const user3 = await createUser({ name: 'User3' });
                await createPosts(3, { authorId: user1.id });
                await createPosts(1, { authorId: user2.id });
                await createPosts(5, { authorId: user3.id });

                // When: 포스트 수로 정렬
                const response = await request(app.getHttpServer())
                    .get('/users?sort=postCount:desc')
                    .expect(200);

                // Then: 포스트가 많은 순으로 정렬
                expect(response.body.data[0].name).toBe('User3');
                expect(response.body.data[1].name).toBe('User1');
                expect(response.body.data[2].name).toBe('User2');
            });
        });

        describe('정렬과 페이지네이션 조합', () => {
            it('TC-SORT-008: 정렬된 결과가 페이지네이션되어야 함', async () => {
                // Given: 알파벳 순서의 사용자들
                for (let i = 0; i < 26; i++) {
                    await createUser({ name: String.fromCharCode(65 + i) }); // A-Z
                }

                // When: 이름순 정렬 + 페이지네이션
                const response = await request(app.getHttpServer())
                    .get('/users?sort=name:asc&page=2&limit=10')
                    .expect(200);

                // Then: K부터 T까지 반환
                expect(response.body.data).toHaveLength(10);
                expect(response.body.data[0].name).toBe('K');
                expect(response.body.data[9].name).toBe('T');
            });

            it('TC-SORT-009: 필터링, 정렬, 페이지네이션이 함께 작동해야 함', async () => {
                // Given: 복잡한 데이터 세트
                for (let i = 1; i <= 30; i++) {
                    await createUser({
                        name: `User${i}`,
                        age: 20 + (i % 10),
                        status: i % 2 === 0 ? 'active' : 'inactive'
                    });
                }

                // When: 필터 + 정렬 + 페이지네이션
                const response = await request(app.getHttpServer())
                    .get('/users?filter=status:eq:active&sort=age:desc&page=1&limit=5')
                    .expect(200);

                // Then: 활성 사용자 중 나이 많은 순으로 5명
                expect(response.body.data).toHaveLength(5);
                expect(response.body.data.every(u => u.status === 'active')).toBe(true);
                expect(response.body.data[0].age).toBeGreaterThanOrEqual(response.body.data[4].age);
            });
        });
    });

    describe('Search', () => {
        it('TC-SEARCH-001: 기본 검색이 작동해야 함', async () => {
            // Given: 다양한 사용자들
            await createUsers([
                { name: 'John Doe', email: 'john@example.com' },
                { name: 'Jane Smith', email: 'jane@example.com' },
                { name: 'Johnny Walker', email: 'walker@example.com' }
            ]);

            // When: "John"으로 검색
            const response = await request(app.getHttpServer())
                .get('/users?search=John')
                .expect(200);

            // Then: John이 포함된 결과만 반환
            expect(response.body.data).toHaveLength(2);
        });

        it('TC-SEARCH-002: 검색 필드를 지정할 수 있어야 함', async () => {
            // Given: 테스트 데이터
            await createUsers([
                { name: 'John', bio: 'Developer' },
                { name: 'Jane', bio: 'John is my friend' },
                { name: 'Bob', bio: 'Designer' }
            ]);

            // When: bio 필드에서만 John 검색
            const response = await request(app.getHttpServer())
                .get('/users?search=John&searchFields=bio')
                .expect(200);

            // Then: bio에 John이 있는 Jane만 반환
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].name).toBe('Jane');
        });

        it('TC-SEARCH-003: 여러 필드에서 검색할 수 있어야 함', async () => {
            // Given: 테스트 데이터
            await createUsers([
                { name: 'John', email: 'john@test.com', bio: 'Developer' },
                { name: 'Jane', email: 'jane@example.com', bio: 'test engineer' },
                { name: 'Bob', email: 'bob@example.com', bio: 'Designer' }
            ]);

            // When: 여러 필드에서 "test" 검색
            const response = await request(app.getHttpServer())
                .get('/users?search=test&searchFields=name,email,bio')
                .expect(200);

            // Then: test가 어디든 포함된 결과 반환
            expect(response.body.data).toHaveLength(2);
        });

        it('TC-SEARCH-004: 대소문자 구분 없이 검색되어야 함', async () => {
            // Given: 대소문자가 섞인 데이터
            await createUsers([
                { name: 'JOHN DOE' },
                { name: 'john smith' },
                { name: 'John Walker' }
            ]);

            // When: 소문자로 검색
            const response = await request(app.getHttpServer())
                .get('/users?search=john')
                .expect(200);

            // Then: 대소문자 구분 없이 모두 반환
            expect(response.body.data).toHaveLength(3);
        });

        it('TC-SEARCH-005: 부분 일치 검색이 작동해야 함', async () => {
            // Given: 테스트 데이터
            await createUsers([
                { email: 'user@example.com' },
                { email: 'admin@example.com' },
                { email: 'test@sample.com' }
            ]);

            // When: 도메인으로 검색
            const response = await request(app.getHttpServer())
                .get('/users?search=example')
                .expect(200);

            // Then: example이 포함된 이메일만 반환
            expect(response.body.data).toHaveLength(2);
        });
    });
});

// Helper functions
async function createUsers(data: any) {
    // 사용자 생성 헬퍼
}

async function createUser(data: any) {
    // 단일 사용자 생성 헬퍼
}

async function createUsersWithIds(ids: number[]) {
    // ID를 지정하여 사용자 생성
}

async function createUsersWithProfiles(data: any) {
    // 프로필과 함께 사용자 생성
}

async function createPost(data: any) {
    // 포스트 생성 헬퍼
}

async function createPosts(count: number, data?: any) {
    // 여러 포스트 생성 헬퍼
}

async function createCategory(data: any) {
    // 카테고리 생성 헬퍼
}

async function createTag(data: any) {
    // 태그 생성 헬퍼
}

async function addTagToPost(postId: number, tagId: number) {
    // 포스트에 태그 추가 헬퍼
}