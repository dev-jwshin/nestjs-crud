/**
 * Validation and Error Handling Test Cases
 * 
 * 이 테스트는 NestJS CRUD 패키지의 검증과 에러 처리 기능을 검증합니다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Validation and Error Handling', () => {
    let app: INestApplication;

    beforeEach(async () => {
        // 테스트 환경 설정
    });

    afterEach(async () => {
        await app?.close();
    });

    describe('입력 검증', () => {
        describe('필수 필드 검증', () => {
            it('TC-VAL-001: 필수 필드가 누락되면 400 에러를 반환해야 함', async () => {
                // Given: name이 필수인 엔티티
                const userData = {
                    email: 'john@example.com'
                    // name 필드 누락
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 검증 에러가 반환되어야 함
                expect(response.body.statusCode).toBe(400);
                expect(response.body.error).toBe('Bad Request');
                expect(response.body.message).toContain('name should not be empty');
            });

            it('TC-VAL-002: 여러 필수 필드가 누락되면 모든 에러를 반환해야 함', async () => {
                // Given: 빈 객체
                const userData = {};

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 모든 필수 필드 에러가 반환되어야 함
                expect(response.body.message).toBeInstanceOf(Array);
                expect(response.body.message).toContain('name should not be empty');
                expect(response.body.message).toContain('email should not be empty');
            });

            it('TC-VAL-003: null 값은 필수 필드 검증에 실패해야 함', async () => {
                // Given: null 값
                const userData = {
                    name: null,
                    email: 'john@example.com'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: null 검증 에러
                expect(response.body.message).toContain('name should not be null');
            });
        });

        describe('타입 검증', () => {
            it('TC-VAL-004: 문자열 필드에 숫자를 입력하면 에러를 반환해야 함', async () => {
                // Given: 잘못된 타입
                const userData = {
                    name: 12345, // 숫자
                    email: 'john@example.com'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 타입 에러
                expect(response.body.message).toContain('name must be a string');
            });

            it('TC-VAL-005: 숫자 필드에 문자열을 입력하면 에러를 반환해야 함', async () => {
                // Given: 잘못된 타입
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    age: 'thirty' // 문자열
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 타입 에러
                expect(response.body.message).toContain('age must be a number');
            });

            it('TC-VAL-006: 불린 필드에 잘못된 값을 입력하면 에러를 반환해야 함', async () => {
                // Given: 잘못된 불린 값
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    isActive: 'yes' // 문자열
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 불린 타입 에러
                expect(response.body.message).toContain('isActive must be a boolean');
            });

            it('TC-VAL-007: 날짜 필드에 잘못된 형식을 입력하면 에러를 반환해야 함', async () => {
                // Given: 잘못된 날짜 형식
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    birthDate: 'not-a-date'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 날짜 형식 에러
                expect(response.body.message).toContain('birthDate must be a valid ISO 8601 date string');
            });

            it('TC-VAL-008: 배열 필드에 단일 값을 입력하면 에러를 반환해야 함', async () => {
                // Given: 배열이 아닌 값
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    tags: 'single-tag' // 문자열
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 배열 타입 에러
                expect(response.body.message).toContain('tags must be an array');
            });
        });

        describe('형식 검증', () => {
            it('TC-VAL-009: 이메일 형식이 잘못되면 에러를 반환해야 함', async () => {
                // Given: 잘못된 이메일 형식
                const userData = {
                    name: 'John',
                    email: 'not-an-email'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 이메일 형식 에러
                expect(response.body.message).toContain('email must be an email');
            });

            it('TC-VAL-010: URL 형식이 잘못되면 에러를 반환해야 함', async () => {
                // Given: 잘못된 URL 형식
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    website: 'not-a-url'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: URL 형식 에러
                expect(response.body.message).toContain('website must be a URL');
            });

            it('TC-VAL-011: UUID 형식이 잘못되면 에러를 반환해야 함', async () => {
                // Given: 잘못된 UUID 형식
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    uuid: 'not-a-uuid'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: UUID 형식 에러
                expect(response.body.message).toContain('uuid must be a UUID');
            });

            it('TC-VAL-012: 전화번호 형식이 잘못되면 에러를 반환해야 함', async () => {
                // Given: 잘못된 전화번호 형식
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    phone: '123' // 너무 짧음
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 전화번호 형식 에러
                expect(response.body.message).toContain('phone must be a valid phone number');
            });
        });

        describe('길이 검증', () => {
            it('TC-VAL-013: 최소 길이보다 짧으면 에러를 반환해야 함', async () => {
                // Given: 너무 짧은 비밀번호
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    password: '123' // 최소 8자
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 최소 길이 에러
                expect(response.body.message).toContain('password must be longer than or equal to 8 characters');
            });

            it('TC-VAL-014: 최대 길이를 초과하면 에러를 반환해야 함', async () => {
                // Given: 너무 긴 이름
                const userData = {
                    name: 'A'.repeat(256), // 최대 255자
                    email: 'john@example.com'
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 최대 길이 에러
                expect(response.body.message).toContain('name must be shorter than or equal to 255 characters');
            });

            it('TC-VAL-015: 배열 크기가 제한을 초과하면 에러를 반환해야 함', async () => {
                // Given: 너무 많은 태그
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    tags: Array(11).fill('tag') // 최대 10개
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 배열 크기 에러
                expect(response.body.message).toContain('tags must contain no more than 10 elements');
            });
        });

        describe('범위 검증', () => {
            it('TC-VAL-016: 최솟값보다 작으면 에러를 반환해야 함', async () => {
                // Given: 너무 어린 나이
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    age: 17 // 최소 18세
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 최솟값 에러
                expect(response.body.message).toContain('age must not be less than 18');
            });

            it('TC-VAL-017: 최댓값보다 크면 에러를 반환해야 함', async () => {
                // Given: 너무 높은 점수
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    score: 101 // 최대 100
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 최댓값 에러
                expect(response.body.message).toContain('score must not be greater than 100');
            });
        });

        describe('패턴 검증', () => {
            it('TC-VAL-018: 정규식 패턴과 일치하지 않으면 에러를 반환해야 함', async () => {
                // Given: 잘못된 사용자명 형식
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    username: 'user@name' // 영숫자와 언더스코어만 허용
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 패턴 에러
                expect(response.body.message).toContain('username must match /^[a-zA-Z0-9_]+$/ regular expression');
            });

            it('TC-VAL-019: 허용된 값 목록에 없으면 에러를 반환해야 함', async () => {
                // Given: 잘못된 역할
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    role: 'superadmin' // admin, user, moderator만 허용
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: enum 에러
                expect(response.body.message).toContain('role must be one of the following values: admin, user, moderator');
            });
        });

        describe('커스텀 검증', () => {
            it('TC-VAL-020: 커스텀 검증 규칙이 작동해야 함', async () => {
                // Given: 비즈니스 규칙 위반
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    startDate: '2024-01-01',
                    endDate: '2023-12-31' // 종료일이 시작일보다 이전
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 커스텀 검증 에러
                expect(response.body.message).toContain('End date must be after start date');
            });

            it('TC-VAL-021: 조건부 검증이 작동해야 함', async () => {
                // Given: 조건부 필수 필드
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    accountType: 'business'
                    // accountType이 business일 때 companyName 필수
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 조건부 검증 에러
                expect(response.body.message).toContain('Company name is required for business accounts');
            });

            it('TC-VAL-022: 복합 검증 규칙이 작동해야 함', async () => {
                // Given: 복합 조건 위반
                const userData = {
                    name: 'John',
                    email: 'john@example.com',
                    age: 16,
                    parentConsent: false
                    // 18세 미만은 부모 동의 필요
                };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 복합 검증 에러
                expect(response.body.message).toContain('Parent consent required for users under 18');
            });
        });
    });

    describe('에러 처리', () => {
        describe('HTTP 상태 코드', () => {
            it('TC-ERR-001: 리소스를 찾을 수 없으면 404를 반환해야 함', async () => {
                // When: 존재하지 않는 리소스 조회
                const response = await request(app.getHttpServer())
                    .get('/users/99999')
                    .expect(404);

                // Then: Not Found 에러
                expect(response.body.statusCode).toBe(404);
                expect(response.body.error).toBe('Not Found');
                expect(response.body.message).toContain('User not found');
            });

            it('TC-ERR-002: 중복된 리소스 생성 시 409를 반환해야 함', async () => {
                // Given: 기존 사용자
                await createUser({ email: 'existing@example.com' });

                // When: 동일한 이메일로 생성 시도
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send({
                        name: 'New User',
                        email: 'existing@example.com'
                    })
                    .expect(409);

                // Then: Conflict 에러
                expect(response.body.statusCode).toBe(409);
                expect(response.body.error).toBe('Conflict');
                expect(response.body.message).toContain('already exists');
            });

            it('TC-ERR-003: 권한이 없으면 403을 반환해야 함', async () => {
                // Given: 관리자 전용 리소스
                const adminResource = await createAdminResource();

                // When: 일반 사용자가 접근 시도
                const response = await request(app.getHttpServer())
                    .get(`/admin/resources/${adminResource.id}`)
                    .set('Authorization', 'Bearer user-token')
                    .expect(403);

                // Then: Forbidden 에러
                expect(response.body.statusCode).toBe(403);
                expect(response.body.error).toBe('Forbidden');
                expect(response.body.message).toContain('Insufficient permissions');
            });

            it('TC-ERR-004: 인증되지 않으면 401을 반환해야 함', async () => {
                // When: 인증 없이 보호된 리소스 접근
                const response = await request(app.getHttpServer())
                    .get('/protected/users')
                    .expect(401);

                // Then: Unauthorized 에러
                expect(response.body.statusCode).toBe(401);
                expect(response.body.error).toBe('Unauthorized');
                expect(response.body.message).toContain('Authentication required');
            });

            it('TC-ERR-005: 서버 에러 시 500을 반환해야 함', async () => {
                // Given: 데이터베이스 연결 끊김 시뮬레이션
                await disconnectDatabase();

                // When: 요청 시도
                const response = await request(app.getHttpServer())
                    .get('/users')
                    .expect(500);

                // Then: Internal Server Error
                expect(response.body.statusCode).toBe(500);
                expect(response.body.error).toBe('Internal Server Error');
                expect(response.body.message).toContain('An error occurred');
            });

            it('TC-ERR-006: 잘못된 요청 형식은 400을 반환해야 함', async () => {
                // When: 잘못된 JSON 전송
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .set('Content-Type', 'application/json')
                    .send('{ invalid json }')
                    .expect(400);

                // Then: Bad Request 에러
                expect(response.body.statusCode).toBe(400);
                expect(response.body.error).toBe('Bad Request');
                expect(response.body.message).toContain('Invalid JSON');
            });

            it('TC-ERR-007: 지원하지 않는 미디어 타입은 415를 반환해야 함', async () => {
                // When: XML로 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .set('Content-Type', 'application/xml')
                    .send('<user><name>John</name></user>')
                    .expect(415);

                // Then: Unsupported Media Type 에러
                expect(response.body.statusCode).toBe(415);
                expect(response.body.error).toBe('Unsupported Media Type');
                expect(response.body.message).toContain('Content-Type must be application/json');
            });

            it('TC-ERR-008: 요청 크기 제한 초과 시 413을 반환해야 함', async () => {
                // Given: 매우 큰 데이터
                const largeData = {
                    name: 'John',
                    email: 'john@example.com',
                    bio: 'A'.repeat(10 * 1024 * 1024) // 10MB
                };

                // When: 큰 데이터 전송
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(largeData)
                    .expect(413);

                // Then: Payload Too Large 에러
                expect(response.body.statusCode).toBe(413);
                expect(response.body.error).toBe('Payload Too Large');
                expect(response.body.message).toContain('Request entity too large');
            });
        });

        describe('에러 메시지 형식', () => {
            it('TC-ERR-009: 에러 응답은 일관된 형식을 가져야 함', async () => {
                // When: 에러 발생
                const response = await request(app.getHttpServer())
                    .get('/users/invalid-id')
                    .expect(400);

                // Then: 표준 에러 형식
                expect(response.body).toHaveProperty('statusCode');
                expect(response.body).toHaveProperty('error');
                expect(response.body).toHaveProperty('message');
                expect(response.body).toHaveProperty('timestamp');
                expect(response.body).toHaveProperty('path');
            });

            it('TC-ERR-010: 검증 에러는 상세한 필드 정보를 포함해야 함', async () => {
                // Given: 여러 검증 에러
                const invalidData = {
                    name: '',
                    email: 'invalid',
                    age: -5
                };

                // When: 검증 실패
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(invalidData)
                    .expect(400);

                // Then: 필드별 에러 정보
                expect(response.body.errors).toBeDefined();
                expect(response.body.errors).toHaveProperty('name');
                expect(response.body.errors).toHaveProperty('email');
                expect(response.body.errors).toHaveProperty('age');
            });

            it('TC-ERR-011: 프로덕션 환경에서는 민감한 정보를 숨겨야 함', async () => {
                // Given: 프로덕션 환경 설정
                process.env.NODE_ENV = 'production';

                // When: 데이터베이스 에러 발생
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send({ /* invalid data */ })
                    .expect(500);

                // Then: 스택 트레이스가 없어야 함
                expect(response.body.stack).toBeUndefined();
                expect(response.body.message).not.toContain('database');
                expect(response.body.message).toBe('Internal server error');
            });

            it('TC-ERR-012: 개발 환경에서는 상세한 디버깅 정보를 제공해야 함', async () => {
                // Given: 개발 환경 설정
                process.env.NODE_ENV = 'development';

                // When: 에러 발생
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send({ /* invalid data */ })
                    .expect(500);

                // Then: 디버깅 정보 포함
                expect(response.body.stack).toBeDefined();
                expect(response.body.details).toBeDefined();
            });
        });

        describe('에러 복구', () => {
            it('TC-ERR-013: 트랜잭션 실패 시 롤백되어야 함', async () => {
                // Given: 복합 작업
                const createData = {
                    user: { name: 'John', email: 'john@example.com' },
                    profile: { bio: 'Developer' },
                    invalidData: { /* 에러를 발생시킬 데이터 */ }
                };

                // When: 트랜잭션 중 에러 발생
                await request(app.getHttpServer())
                    .post('/users/with-profile')
                    .send(createData)
                    .expect(500);

                // Then: 아무것도 생성되지 않아야 함
                const users = await getUsers();
                const profiles = await getProfiles();
                expect(users).toHaveLength(0);
                expect(profiles).toHaveLength(0);
            });

            it('TC-ERR-014: 재시도 가능한 에러는 재시도 정보를 포함해야 함', async () => {
                // Given: Rate limit 도달
                for (let i = 0; i < 100; i++) {
                    await request(app.getHttpServer()).get('/users');
                }

                // When: Rate limit 초과
                const response = await request(app.getHttpServer())
                    .get('/users')
                    .expect(429);

                // Then: 재시도 정보 포함
                expect(response.body.statusCode).toBe(429);
                expect(response.body.error).toBe('Too Many Requests');
                expect(response.headers['retry-after']).toBeDefined();
                expect(response.body.message).toContain('Try again in');
            });

            it('TC-ERR-015: 일시적 에러는 자동 재시도되어야 함', async () => {
                // Given: 일시적 네트워크 에러 시뮬레이션
                let attemptCount = 0;
                mockNetworkError(() => {
                    attemptCount++;
                    if (attemptCount < 3) throw new Error('Network error');
                });

                // When: 요청 (자동 재시도 포함)
                const response = await request(app.getHttpServer())
                    .get('/external-api/data')
                    .expect(200);

                // Then: 재시도 후 성공
                expect(attemptCount).toBe(3);
                expect(response.body.data).toBeDefined();
            });
        });

        describe('에러 로깅', () => {
            it('TC-ERR-016: 모든 에러는 로그에 기록되어야 함', async () => {
                // Given: 로그 스파이
                const logSpy = jest.spyOn(logger, 'error');

                // When: 에러 발생
                await request(app.getHttpServer())
                    .get('/users/invalid')
                    .expect(400);

                // Then: 로그 기록 확인
                expect(logSpy).toHaveBeenCalled();
                expect(logSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Error'),
                    expect.objectContaining({
                        statusCode: 400,
                        path: '/users/invalid'
                    })
                );
            });

            it('TC-ERR-017: 중요 에러는 알림을 발송해야 함', async () => {
                // Given: 알림 스파이
                const alertSpy = jest.spyOn(alertService, 'send');

                // When: 중요 에러 발생 (데이터베이스 연결 끊김)
                await disconnectDatabase();
                await request(app.getHttpServer())
                    .get('/users')
                    .expect(500);

                // Then: 알림 발송 확인
                expect(alertSpy).toHaveBeenCalledWith({
                    level: 'critical',
                    message: expect.stringContaining('Database connection lost'),
                    timestamp: expect.any(Date)
                });
            });

            it('TC-ERR-018: 에러 통계가 수집되어야 함', async () => {
                // Given: 통계 수집기
                const statsBefore = await getErrorStats();

                // When: 여러 에러 발생
                await request(app.getHttpServer()).get('/users/999').expect(404);
                await request(app.getHttpServer()).post('/users').send({}).expect(400);
                await request(app.getHttpServer()).delete('/users/1').expect(403);

                // Then: 통계 업데이트 확인
                const statsAfter = await getErrorStats();
                expect(statsAfter['404']).toBe(statsBefore['404'] + 1);
                expect(statsAfter['400']).toBe(statsBefore['400'] + 1);
                expect(statsAfter['403']).toBe(statsBefore['403'] + 1);
            });
        });

        describe('비즈니스 로직 에러', () => {
            it('TC-ERR-019: 비즈니스 규칙 위반 시 적절한 에러를 반환해야 함', async () => {
                // Given: 잔액이 부족한 계정
                const account = await createAccount({ balance: 100 });

                // When: 초과 출금 시도
                const response = await request(app.getHttpServer())
                    .post(`/accounts/${account.id}/withdraw`)
                    .send({ amount: 150 })
                    .expect(400);

                // Then: 비즈니스 에러
                expect(response.body.error).toBe('Bad Request');
                expect(response.body.message).toBe('Insufficient balance');
                expect(response.body.code).toBe('INSUFFICIENT_BALANCE');
            });

            it('TC-ERR-020: 상태 전이 에러를 처리해야 함', async () => {
                // Given: 완료된 주문
                const order = await createOrder({ status: 'completed' });

                // When: 취소 시도
                const response = await request(app.getHttpServer())
                    .patch(`/orders/${order.id}/cancel`)
                    .expect(400);

                // Then: 상태 전이 에러
                expect(response.body.message).toBe('Cannot cancel completed order');
                expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
            });

            it('TC-ERR-021: 동시성 충돌을 감지해야 함', async () => {
                // Given: 버전이 있는 엔티티
                const entity = await createEntity({ version: 1 });

                // 다른 곳에서 업데이트
                await updateEntity(entity.id, { version: 1, data: 'updated' });

                // When: 오래된 버전으로 업데이트 시도
                const response = await request(app.getHttpServer())
                    .patch(`/entities/${entity.id}`)
                    .send({ version: 1, data: 'conflicting' })
                    .expect(409);

                // Then: 동시성 충돌 에러
                expect(response.body.error).toBe('Conflict');
                expect(response.body.message).toBe('Entity was modified by another process');
                expect(response.body.code).toBe('OPTIMISTIC_LOCK_ERROR');
            });
        });

        describe('파일 업로드 에러', () => {
            it('TC-ERR-022: 지원하지 않는 파일 형식은 거부해야 함', async () => {
                // When: 실행 파일 업로드 시도
                const response = await request(app.getHttpServer())
                    .post('/upload')
                    .attach('file', 'test.exe', Buffer.from('executable'))
                    .expect(400);

                // Then: 파일 형식 에러
                expect(response.body.message).toBe('File type not allowed');
                expect(response.body.allowedTypes).toContain('jpg');
                expect(response.body.allowedTypes).toContain('png');
            });

            it('TC-ERR-023: 파일 크기 제한을 초과하면 거부해야 함', async () => {
                // Given: 큰 파일
                const largeFile = Buffer.alloc(11 * 1024 * 1024); // 11MB

                // When: 업로드 시도
                const response = await request(app.getHttpServer())
                    .post('/upload')
                    .attach('file', 'large.jpg', largeFile)
                    .expect(413);

                // Then: 파일 크기 에러
                expect(response.body.message).toBe('File too large');
                expect(response.body.maxSize).toBe('10MB');
            });

            it('TC-ERR-024: 악성 파일은 거부해야 함', async () => {
                // Given: 악성 코드를 포함한 파일
                const maliciousFile = Buffer.from('<?php system($_GET["cmd"]); ?>');

                // When: 업로드 시도
                const response = await request(app.getHttpServer())
                    .post('/upload')
                    .attach('file', 'image.jpg', maliciousFile)
                    .expect(400);

                // Then: 보안 에러
                expect(response.body.message).toBe('File contains malicious content');
                expect(response.body.code).toBe('MALICIOUS_FILE');
            });
        });
    });

    describe('allowedParams 검증', () => {
        it('TC-PARAM-001: allowedParams에 정의된 필드만 허용해야 함', async () => {
            // Given: allowedParams = ['name', 'email']
            const userData = {
                name: 'John',
                email: 'john@example.com',
                salary: 100000, // 허용되지 않은 필드
                ssn: '123-45-6789' // 허용되지 않은 필드
            };

            // When: 생성 요청
            const response = await request(app.getHttpServer())
                .post('/restricted-users')
                .send(userData)
                .expect(201);

            // Then: 허용된 필드만 저장되어야 함
            expect(response.body.data.name).toBe('John');
            expect(response.body.data.email).toBe('john@example.com');
            expect(response.body.data.salary).toBeUndefined();
            expect(response.body.data.ssn).toBeUndefined();
        });

        it('TC-PARAM-002: 업데이트 시 allowedParams가 적용되어야 함', async () => {
            // Given: 기존 사용자
            const user = await createRestrictedUser({
                name: 'John',
                email: 'john@example.com',
                role: 'admin'
            });

            // When: 제한된 필드 업데이트 시도
            const response = await request(app.getHttpServer())
                .patch(`/restricted-users/${user.id}`)
                .send({
                    name: 'John Updated',
                    role: 'superadmin' // 허용되지 않은 필드
                })
                .expect(200);

            // Then: 허용된 필드만 업데이트되어야 함
            expect(response.body.data.name).toBe('John Updated');
            expect(response.body.data.role).toBe('admin'); // 변경되지 않음
        });

        it('TC-PARAM-003: 중첩 객체의 allowedParams가 작동해야 함', async () => {
            // Given: allowedParams = ['name', 'profile.bio']
            const userData = {
                name: 'John',
                profile: {
                    bio: 'Developer',
                    salary: 100000 // 허용되지 않은 중첩 필드
                }
            };

            // When: 생성 요청
            const response = await request(app.getHttpServer())
                .post('/nested-restricted-users')
                .send(userData)
                .expect(201);

            // Then: 허용된 중첩 필드만 저장되어야 함
            expect(response.body.data.profile.bio).toBe('Developer');
            expect(response.body.data.profile.salary).toBeUndefined();
        });
    });
});

// Helper functions
async function createUser(data: any) {
    // 사용자 생성 헬퍼
}

async function createAdminResource() {
    // 관리자 리소스 생성 헬퍼
}

async function disconnectDatabase() {
    // 데이터베이스 연결 끊기 헬퍼
}

async function getUsers() {
    // 사용자 목록 조회 헬퍼
}

async function getProfiles() {
    // 프로필 목록 조회 헬퍼
}

async function mockNetworkError(fn: Function) {
    // 네트워크 에러 시뮬레이션 헬퍼
}

async function getErrorStats() {
    // 에러 통계 조회 헬퍼
}

async function createAccount(data: any) {
    // 계정 생성 헬퍼
}

async function createOrder(data: any) {
    // 주문 생성 헬퍼
}

async function createEntity(data: any) {
    // 엔티티 생성 헬퍼
}

async function updateEntity(id: number, data: any) {
    // 엔티티 업데이트 헬퍼
}

async function createRestrictedUser(data: any) {
    // 제한된 사용자 생성 헬퍼
}