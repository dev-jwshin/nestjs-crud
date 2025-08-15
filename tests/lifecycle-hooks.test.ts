/**
 * Lifecycle Hooks and Decorators Test Cases
 * 
 * 이 테스트는 NestJS CRUD 패키지의 생명주기 훅과 데코레이터 기능을 검증합니다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

describe('Lifecycle Hooks and Decorators', () => {
    let app: INestApplication;

    beforeEach(async () => {
        // 테스트 환경 설정
    });

    afterEach(async () => {
        await app?.close();
    });

    describe('CREATE Hooks', () => {
        describe('assignBefore Hook', () => {
            it('TC-HOOK-001: CREATE 시 assignBefore 훅이 실행되어야 함', async () => {
                // Given: assignBefore 훅이 설정된 엔티티
                const hookExecuted = jest.fn();
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 훅이 실행되어야 함
                expect(hookExecuted).toHaveBeenCalledWith(
                    expect.objectContaining(userData),
                    expect.objectContaining({ operation: 'create' })
                );
            });

            it('TC-HOOK-002: assignBefore에서 데이터를 변경할 수 있어야 함', async () => {
                // Given: 데이터를 수정하는 assignBefore 훅
                const userData = { name: 'john', email: 'john@example.com' };
                // Hook: name을 대문자로 변환

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 변경된 데이터가 저장되어야 함
                expect(response.body.data.name).toBe('JOHN');
            });

            it('TC-HOOK-003: assignBefore에서 필드를 추가할 수 있어야 함', async () => {
                // Given: 필드를 추가하는 assignBefore 훅
                const userData = { name: 'John', email: 'john@example.com' };
                // Hook: createdBy 필드 추가

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 추가된 필드가 저장되어야 함
                expect(response.body.data.createdBy).toBe('system');
            });

            it('TC-HOOK-004: assignBefore에서 검증 실패 시 에러를 반환해야 함', async () => {
                // Given: 검증하는 assignBefore 훅
                const userData = { name: 'a', email: 'john@example.com' };
                // Hook: 이름이 2자 이상인지 검증

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(400);

                // Then: 검증 에러가 반환되어야 함
                expect(response.body.error).toContain('Name too short');
            });

            it('TC-HOOK-005: 비동기 assignBefore 훅이 작동해야 함', async () => {
                // Given: 외부 서비스를 호출하는 비동기 훅
                const userData = { name: 'John', email: 'john@example.com' };
                // Hook: 외부 API에서 추가 정보 가져오기

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 비동기로 가져온 데이터가 포함되어야 함
                expect(response.body.data.externalId).toBeDefined();
            });
        });

        describe('assignAfter Hook', () => {
            it('TC-HOOK-006: CREATE 시 assignAfter 훅이 실행되어야 함', async () => {
                // Given: assignAfter 훅이 설정된 엔티티
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 엔티티 생성 후 훅이 실행되어야 함
                expect(response.body.data.processedAt).toBeDefined();
            });

            it('TC-HOOK-007: assignAfter에서 엔티티를 수정할 수 있어야 함', async () => {
                // Given: 엔티티를 수정하는 assignAfter 훅
                const userData = { name: 'John', email: 'john@example.com' };
                // Hook: displayName 필드 생성

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 수정된 필드가 반환되어야 함
                expect(response.body.data.displayName).toBe('John (john@example.com)');
            });

            it('TC-HOOK-008: assignAfter에서 관계를 설정할 수 있어야 함', async () => {
                // Given: 기본 역할을 설정하는 assignAfter 훅
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 기본 역할이 설정되어야 함
                expect(response.body.data.roles).toContain('user');
            });
        });

        describe('saveBefore Hook', () => {
            it('TC-HOOK-009: CREATE 시 saveBefore 훅이 실행되어야 함', async () => {
                // Given: saveBefore 훅이 설정된 엔티티
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: DB 저장 전 훅이 실행되어야 함
                expect(response.body.data.validatedAt).toBeDefined();
            });

            it('TC-HOOK-010: saveBefore에서 최종 검증을 수행해야 함', async () => {
                // Given: 중복 검사를 하는 saveBefore 훅
                await createUser({ email: 'existing@example.com' });
                const userData = { name: 'John', email: 'existing@example.com' };

                // When: 동일한 이메일로 생성 시도
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(409);

                // Then: 중복 에러가 반환되어야 함
                expect(response.body.error).toContain('Email already exists');
            });

            it('TC-HOOK-011: saveBefore에서 관련 데이터를 생성할 수 있어야 함', async () => {
                // Given: 프로필을 생성하는 saveBefore 훅
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 사용자 생성
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 프로필도 함께 생성되어야 함
                const profile = await getProfile(response.body.data.id);
                expect(profile).toBeDefined();
                expect(profile.userId).toBe(response.body.data.id);
            });
        });

        describe('saveAfter Hook', () => {
            it('TC-HOOK-012: CREATE 시 saveAfter 훅이 실행되어야 함', async () => {
                // Given: saveAfter 훅이 설정된 엔티티
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                const response = await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: DB 저장 후 훅이 실행되어야 함
                expect(response.body.data.indexedAt).toBeDefined();
            });

            it('TC-HOOK-013: saveAfter에서 이벤트를 발생시킬 수 있어야 함', async () => {
                // Given: 이벤트를 발생시키는 saveAfter 훅
                const eventSpy = jest.fn();
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 이벤트가 발생해야 함
                expect(eventSpy).toHaveBeenCalledWith('user.created', expect.any(Object));
            });

            it('TC-HOOK-014: saveAfter에서 외부 서비스를 호출할 수 있어야 함', async () => {
                // Given: 이메일을 보내는 saveAfter 훅
                const emailSpy = jest.fn();
                const userData = { name: 'John', email: 'john@example.com' };

                // When: 생성 요청
                await request(app.getHttpServer())
                    .post('/users')
                    .send(userData)
                    .expect(201);

                // Then: 환영 이메일이 발송되어야 함
                expect(emailSpy).toHaveBeenCalledWith(
                    'john@example.com',
                    'Welcome John!'
                );
            });
        });
    });

    describe('UPDATE Hooks', () => {
        describe('assignBefore Hook', () => {
            it('TC-HOOK-015: UPDATE 시 assignBefore 훅이 실행되어야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John' });
                const updateData = { name: 'John Updated' };

                // When: 업데이트 요청
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send(updateData)
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(response.body.data.updatedAt).toBeDefined();
            });

            it('TC-HOOK-016: UPDATE assignBefore에서 변경 내역을 추적할 수 있어야 함', async () => {
                // Given: 변경 추적 훅이 설정된 사용자
                const user = await createUser({ name: 'John', age: 30 });

                // When: 업데이트 요청
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ age: 31 })
                    .expect(200);

                // Then: 변경 내역이 기록되어야 함
                expect(response.body.data.changeLog).toContain('age: 30 -> 31');
            });

            it('TC-HOOK-017: UPDATE assignBefore에서 권한을 검증할 수 있어야 함', async () => {
                // Given: 관리자만 수정 가능한 필드
                const user = await createUser({ role: 'user' });

                // When: 일반 사용자가 역할 변경 시도
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ role: 'admin' })
                    .set('Authorization', 'Bearer user-token')
                    .expect(403);

                // Then: 권한 에러가 반환되어야 함
                expect(response.body.error).toContain('Insufficient permissions');
            });
        });

        describe('assignAfter Hook', () => {
            it('TC-HOOK-018: UPDATE 시 assignAfter 훅이 실행되어야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John' });

                // When: 업데이트 요청
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'John Updated' })
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(response.body.data.modifiedBy).toBeDefined();
            });

            it('TC-HOOK-019: UPDATE assignAfter에서 계산 필드를 업데이트할 수 있어야 함', async () => {
                // Given: 점수를 가진 사용자
                const user = await createUser({ 
                    name: 'John',
                    scores: [80, 90, 70]
                });

                // When: 점수 업데이트
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ scores: [85, 95, 75] })
                    .expect(200);

                // Then: 평균이 계산되어야 함
                expect(response.body.data.averageScore).toBe(85);
            });
        });

        describe('saveBefore Hook', () => {
            it('TC-HOOK-020: UPDATE 시 saveBefore 훅이 실행되어야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John', version: 1 });

                // When: 업데이트 요청
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'John Updated' })
                    .expect(200);

                // Then: 버전이 증가해야 함
                expect(response.body.data.version).toBe(2);
            });

            it('TC-HOOK-021: saveBefore에서 낙관적 잠금을 구현할 수 있어야 함', async () => {
                // Given: 버전이 있는 사용자
                const user = await createUser({ name: 'John', version: 1 });

                // When: 오래된 버전으로 업데이트 시도
                const response = await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'Updated', version: 0 })
                    .expect(409);

                // Then: 충돌 에러가 반환되어야 함
                expect(response.body.error).toContain('Version conflict');
            });
        });

        describe('saveAfter Hook', () => {
            it('TC-HOOK-022: UPDATE 시 saveAfter 훅이 실행되어야 함', async () => {
                // Given: 기존 사용자
                const user = await createUser({ name: 'John' });
                const auditSpy = jest.fn();

                // When: 업데이트 요청
                await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'John Updated' })
                    .expect(200);

                // Then: 감사 로그가 생성되어야 함
                expect(auditSpy).toHaveBeenCalledWith({
                    action: 'UPDATE',
                    entityId: user.id,
                    changes: expect.any(Object)
                });
            });

            it('TC-HOOK-023: saveAfter에서 캐시를 무효화할 수 있어야 함', async () => {
                // Given: 캐시된 사용자
                const user = await createUser({ name: 'John' });
                await cacheUser(user);

                // When: 업데이트 요청
                await request(app.getHttpServer())
                    .patch(`/users/${user.id}`)
                    .send({ name: 'John Updated' })
                    .expect(200);

                // Then: 캐시가 무효화되어야 함
                const cached = await getCachedUser(user.id);
                expect(cached).toBeNull();
            });
        });
    });

    describe('UPSERT Hooks', () => {
        it('TC-HOOK-024: UPSERT 생성 시 CREATE 훅이 실행되어야 함', async () => {
            // Given: 존재하지 않는 이메일
            const userData = { email: 'new@example.com', name: 'New User' };
            const createHookSpy = jest.fn();

            // When: Upsert 요청
            const response = await request(app.getHttpServer())
                .put('/users')
                .send(userData)
                .expect(201);

            // Then: CREATE 훅이 실행되어야 함
            expect(createHookSpy).toHaveBeenCalled();
            expect(response.body.data.createdVia).toBe('upsert');
        });

        it('TC-HOOK-025: UPSERT 업데이트 시 UPDATE 훅이 실행되어야 함', async () => {
            // Given: 기존 사용자
            const user = await createUser({ email: 'existing@example.com' });
            const updateHookSpy = jest.fn();

            // When: 동일한 이메일로 Upsert
            const response = await request(app.getHttpServer())
                .put('/users')
                .send({ email: 'existing@example.com', name: 'Updated' })
                .expect(200);

            // Then: UPDATE 훅이 실행되어야 함
            expect(updateHookSpy).toHaveBeenCalled();
            expect(response.body.data.updatedVia).toBe('upsert');
        });

        it('TC-HOOK-026: UPSERT 전용 훅이 실행되어야 함', async () => {
            // Given: UPSERT 전용 훅
            const upsertHookSpy = jest.fn();

            // When: Upsert 요청
            await request(app.getHttpServer())
                .put('/users')
                .send({ email: 'test@example.com', name: 'Test' })
                .expect(201);

            // Then: UPSERT 전용 훅이 실행되어야 함
            expect(upsertHookSpy).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({ operation: 'upsert' })
            );
        });
    });

    describe('DELETE Hooks', () => {
        describe('destroyBefore Hook', () => {
            it('TC-HOOK-027: DELETE 시 destroyBefore 훅이 실행되어야 함', async () => {
                // Given: 삭제할 사용자
                const user = await createUser({ name: 'ToDelete' });
                const hookSpy = jest.fn();

                // When: 삭제 요청
                await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(hookSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ id: user.id }),
                    expect.objectContaining({ operation: 'destroy' })
                );
            });

            it('TC-HOOK-028: destroyBefore에서 삭제를 차단할 수 있어야 함', async () => {
                // Given: 삭제 불가능한 시스템 사용자
                const user = await createUser({ name: 'System', isSystem: true });

                // When: 삭제 시도
                const response = await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(403);

                // Then: 삭제가 차단되어야 함
                expect(response.body.error).toContain('Cannot delete system user');
            });

            it('TC-HOOK-029: destroyBefore에서 관련 데이터를 정리할 수 있어야 함', async () => {
                // Given: 포스트가 있는 사용자
                const user = await createUser({ name: 'Author' });
                const post = await createPost({ authorId: user.id });

                // When: 사용자 삭제
                await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 포스트의 작성자가 null로 설정되어야 함
                const updatedPost = await getPost(post.id);
                expect(updatedPost.authorId).toBeNull();
            });
        });

        describe('destroyAfter Hook', () => {
            it('TC-HOOK-030: DELETE 시 destroyAfter 훅이 실행되어야 함', async () => {
                // Given: 삭제할 사용자
                const user = await createUser({ name: 'ToDelete' });
                const cleanupSpy = jest.fn();

                // When: 삭제 요청
                await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 정리 작업이 실행되어야 함
                expect(cleanupSpy).toHaveBeenCalledWith(user.id);
            });

            it('TC-HOOK-031: destroyAfter에서 로그를 기록할 수 있어야 함', async () => {
                // Given: 삭제할 사용자
                const user = await createUser({ name: 'ToDelete' });

                // When: 삭제 요청
                await request(app.getHttpServer())
                    .delete(`/users/${user.id}`)
                    .expect(200);

                // Then: 삭제 로그가 기록되어야 함
                const log = await getDeletionLog(user.id);
                expect(log).toBeDefined();
                expect(log.deletedAt).toBeDefined();
                expect(log.deletedBy).toBeDefined();
            });
        });

        describe('소프트 삭제 Hooks', () => {
            it('TC-HOOK-032: 소프트 삭제 시 destroyBefore 훅이 실행되어야 함', async () => {
                // Given: 소프트 삭제 가능한 포스트
                const post = await createPost({ title: 'ToSoftDelete' });
                const hookSpy = jest.fn();

                // When: 소프트 삭제
                await request(app.getHttpServer())
                    .delete(`/posts/${post.id}`)
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(hookSpy).toHaveBeenCalled();
            });

            it('TC-HOOK-033: 소프트 삭제 전 백업을 생성할 수 있어야 함', async () => {
                // Given: 중요한 데이터를 가진 포스트
                const post = await createPost({ 
                    title: 'Important',
                    content: 'Critical data'
                });

                // When: 소프트 삭제
                await request(app.getHttpServer())
                    .delete(`/posts/${post.id}`)
                    .expect(200);

                // Then: 백업이 생성되어야 함
                const backup = await getBackup('post', post.id);
                expect(backup).toBeDefined();
                expect(backup.data).toMatchObject({
                    title: 'Important',
                    content: 'Critical data'
                });
            });
        });
    });

    describe('RECOVER Hooks', () => {
        describe('recoverBefore Hook', () => {
            it('TC-HOOK-034: RECOVER 시 recoverBefore 훅이 실행되어야 함', async () => {
                // Given: 소프트 삭제된 포스트
                const post = await createPost({ title: 'Deleted' });
                await softDeletePost(post.id);
                const hookSpy = jest.fn();

                // When: 복구 요청
                await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(hookSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ id: post.id }),
                    expect.objectContaining({ operation: 'recover' })
                );
            });

            it('TC-HOOK-035: recoverBefore에서 복구를 차단할 수 있어야 함', async () => {
                // Given: 영구 삭제 표시된 포스트
                const post = await createPost({ title: 'Permanent' });
                await permanentlyDeletePost(post.id);

                // When: 복구 시도
                const response = await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(403);

                // Then: 복구가 차단되어야 함
                expect(response.body.error).toContain('Cannot recover permanently deleted item');
            });

            it('TC-HOOK-036: recoverBefore에서 복구 권한을 검증할 수 있어야 함', async () => {
                // Given: 다른 사용자가 삭제한 포스트
                const post = await createPost({ 
                    title: 'Others',
                    deletedBy: 'other-user'
                });
                await softDeletePost(post.id);

                // When: 현재 사용자가 복구 시도
                const response = await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .set('Authorization', 'Bearer current-user-token')
                    .expect(403);

                // Then: 권한 에러가 반환되어야 함
                expect(response.body.error).toContain('No permission to recover');
            });
        });

        describe('recoverAfter Hook', () => {
            it('TC-HOOK-037: RECOVER 시 recoverAfter 훅이 실행되어야 함', async () => {
                // Given: 소프트 삭제된 포스트
                const post = await createPost({ title: 'Deleted' });
                await softDeletePost(post.id);
                const restoreSpy = jest.fn();

                // When: 복구 요청
                await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(200);

                // Then: 복구 후 작업이 실행되어야 함
                expect(restoreSpy).toHaveBeenCalledWith(post.id);
            });

            it('TC-HOOK-038: recoverAfter에서 관련 데이터를 복구할 수 있어야 함', async () => {
                // Given: 관련 데이터가 있는 삭제된 포스트
                const post = await createPost({ title: 'With Comments' });
                const comment = await createComment({ postId: post.id });
                await softDeletePost(post.id); // 댓글도 함께 삭제됨

                // When: 포스트 복구
                await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(200);

                // Then: 댓글도 복구되어야 함
                const recoveredComment = await getComment(comment.id);
                expect(recoveredComment.deletedAt).toBeNull();
            });

            it('TC-HOOK-039: recoverAfter에서 복구 이력을 기록할 수 있어야 함', async () => {
                // Given: 소프트 삭제된 포스트
                const post = await createPost({ title: 'Deleted' });
                await softDeletePost(post.id);

                // When: 복구
                await request(app.getHttpServer())
                    .post(`/posts/${post.id}/recover`)
                    .expect(200);

                // Then: 복구 이력이 기록되어야 함
                const history = await getRecoveryHistory(post.id);
                expect(history).toBeDefined();
                expect(history.recoveredAt).toBeDefined();
                expect(history.recoveredBy).toBeDefined();
            });
        });
    });

    describe('SHOW Hooks', () => {
        describe('assignBefore Hook for Show', () => {
            it('TC-HOOK-040: SHOW 시 assignBefore 훅이 실행되어야 함', async () => {
                // Given: 조회할 사용자
                const user = await createUser({ name: 'John' });
                const hookSpy = jest.fn();

                // When: 조회 요청
                await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(200);

                // Then: 훅이 실행되어야 함
                expect(hookSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ id: user.id }),
                    expect.objectContaining({ operation: 'show' })
                );
            });

            it('TC-HOOK-041: SHOW assignBefore에서 파라미터를 변환할 수 있어야 함', async () => {
                // Given: UUID를 사용하는 사용자
                const user = await createUser({ 
                    uuid: 'abc-123',
                    name: 'John'
                });

                // When: UUID로 조회 (내부적으로 ID로 변환)
                const response = await request(app.getHttpServer())
                    .get('/users/abc-123')
                    .expect(200);

                // Then: 올바른 사용자가 조회되어야 함
                expect(response.body.data.name).toBe('John');
            });

            it('TC-HOOK-042: SHOW assignBefore에서 조회 권한을 검증할 수 있어야 함', async () => {
                // Given: 비공개 프로필
                const user = await createUser({ 
                    name: 'Private',
                    isPrivate: true
                });

                // When: 다른 사용자가 조회 시도
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .set('Authorization', 'Bearer other-user-token')
                    .expect(403);

                // Then: 권한 에러가 반환되어야 함
                expect(response.body.error).toContain('Access denied');
            });
        });

        describe('assignAfter Hook for Show', () => {
            it('TC-HOOK-043: SHOW 시 assignAfter 훅이 실행되어야 함', async () => {
                // Given: 조회할 사용자
                const user = await createUser({ 
                    name: 'John',
                    password: 'secret123'
                });

                // When: 조회 요청
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(200);

                // Then: 민감한 정보가 마스킹되어야 함
                expect(response.body.data.password).toBe('***HIDDEN***');
            });

            it('TC-HOOK-044: SHOW assignAfter에서 계산 필드를 추가할 수 있어야 함', async () => {
                // Given: 생성일이 있는 사용자
                const user = await createUser({ 
                    name: 'John',
                    createdAt: new Date('2024-01-01')
                });

                // When: 조회 요청
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(200);

                // Then: 계정 나이가 계산되어야 함
                expect(response.body.data.accountAge).toBeDefined();
                expect(response.body.data.accountAge).toContain('days');
            });

            it('TC-HOOK-045: SHOW assignAfter에서 조회 기록을 남길 수 있어야 함', async () => {
                // Given: 조회할 사용자
                const user = await createUser({ name: 'John' });

                // When: 조회 요청
                await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .set('Authorization', 'Bearer viewer-token')
                    .expect(200);

                // Then: 조회 기록이 저장되어야 함
                const viewLog = await getViewLog(user.id);
                expect(viewLog).toBeDefined();
                expect(viewLog.viewedBy).toBe('viewer');
                expect(viewLog.viewedAt).toBeDefined();
            });

            it('TC-HOOK-046: SHOW assignAfter에서 관련 데이터를 포함할 수 있어야 함', async () => {
                // Given: 포스트가 있는 사용자
                const user = await createUser({ name: 'Author' });
                await createPost({ authorId: user.id, title: 'Post 1' });
                await createPost({ authorId: user.id, title: 'Post 2' });

                // When: 조회 요청
                const response = await request(app.getHttpServer())
                    .get(`/users/${user.id}`)
                    .expect(200);

                // Then: 포스트 수가 포함되어야 함
                expect(response.body.data.postCount).toBe(2);
            });
        });
    });

    describe('Hook Chaining', () => {
        it('TC-HOOK-047: 여러 훅이 순서대로 실행되어야 함', async () => {
            // Given: 여러 훅이 설정된 엔티티
            const executionOrder: string[] = [];
            const userData = { name: 'John' };

            // When: 생성 요청
            await request(app.getHttpServer())
                .post('/users')
                .send(userData)
                .expect(201);

            // Then: 올바른 순서로 실행되어야 함
            expect(executionOrder).toEqual([
                'assignBefore',
                'assignAfter',
                'saveBefore',
                'saveAfter'
            ]);
        });

        it('TC-HOOK-048: 훅 체인 중 실패 시 롤백되어야 함', async () => {
            // Given: saveBefore에서 실패하는 훅
            const userData = { name: 'John', failAt: 'saveBefore' };

            // When: 생성 시도
            const response = await request(app.getHttpServer())
                .post('/users')
                .send(userData)
                .expect(500);

            // Then: 아무것도 저장되지 않아야 함
            const count = await getUserCount();
            expect(count).toBe(0);
        });

        it('TC-HOOK-049: 여러 훅이 데이터를 순차적으로 변경할 수 있어야 함', async () => {
            // Given: 데이터를 변경하는 여러 훅
            const userData = { name: 'john' };

            // When: 생성 요청
            const response = await request(app.getHttpServer())
                .post('/users')
                .send(userData)
                .expect(201);

            // Then: 모든 변경이 적용되어야 함
            expect(response.body.data.name).toBe('JOHN'); // assignBefore: lowercase -> uppercase
            expect(response.body.data.nameLength).toBe(4); // assignAfter: add length
            expect(response.body.data.validated).toBe(true); // saveBefore: add validation
            expect(response.body.data.indexed).toBe(true); // saveAfter: add indexing
        });
    });

    describe('Decorator-based Hooks', () => {
        it('TC-HOOK-050: @BeforeCreate 데코레이터가 작동해야 함', async () => {
            // Given: @BeforeCreate가 적용된 메서드
            const userData = { name: 'John' };

            // When: 생성 요청
            const response = await request(app.getHttpServer())
                .post('/decorated-users')
                .send(userData)
                .expect(201);

            // Then: 데코레이터 메서드가 실행되어야 함
            expect(response.body.data.beforeCreateExecuted).toBe(true);
        });

        it('TC-HOOK-051: @AfterUpdate 데코레이터가 작동해야 함', async () => {
            // Given: @AfterUpdate가 적용된 메서드
            const user = await createDecoratedUser({ name: 'John' });

            // When: 업데이트 요청
            const response = await request(app.getHttpServer())
                .patch(`/decorated-users/${user.id}`)
                .send({ name: 'Updated' })
                .expect(200);

            // Then: 데코레이터 메서드가 실행되어야 함
            expect(response.body.data.afterUpdateExecuted).toBe(true);
        });

        it('TC-HOOK-052: @BeforeDestroy 데코레이터가 작동해야 함', async () => {
            // Given: @BeforeDestroy가 적용된 메서드
            const user = await createDecoratedUser({ name: 'ToDelete' });

            // When: 삭제 요청
            await request(app.getHttpServer())
                .delete(`/decorated-users/${user.id}`)
                .expect(200);

            // Then: 데코레이터 메서드가 실행되어야 함
            const log = await getExecutionLog('beforeDestroy', user.id);
            expect(log).toBeDefined();
        });

        it('TC-HOOK-053: @BeforeRecover 데코레이터가 작동해야 함', async () => {
            // Given: 소프트 삭제된 엔티티
            const entity = await createDecoratedEntity({ name: 'Deleted' });
            await softDeleteEntity(entity.id);

            // When: 복구 요청
            const response = await request(app.getHttpServer())
                .post(`/decorated-entities/${entity.id}/recover`)
                .expect(200);

            // Then: 데코레이터 메서드가 실행되어야 함
            expect(response.body.data.beforeRecoverExecuted).toBe(true);
        });

        it('TC-HOOK-054: @BeforeShow 데코레이터가 작동해야 함', async () => {
            // Given: @BeforeShow가 적용된 메서드
            const user = await createDecoratedUser({ name: 'John' });

            // When: 조회 요청
            const response = await request(app.getHttpServer())
                .get(`/decorated-users/${user.id}`)
                .expect(200);

            // Then: 데코레이터 메서드가 실행되어야 함
            expect(response.body.data.beforeShowExecuted).toBe(true);
        });

        it('TC-HOOK-055: @AfterShow 데코레이터가 작동해야 함', async () => {
            // Given: @AfterShow가 적용된 메서드
            const user = await createDecoratedUser({ 
                name: 'John',
                secretField: 'sensitive'
            });

            // When: 조회 요청
            const response = await request(app.getHttpServer())
                .get(`/decorated-users/${user.id}`)
                .expect(200);

            // Then: 민감한 필드가 제거되어야 함
            expect(response.body.data.secretField).toBeUndefined();
            expect(response.body.data.afterShowExecuted).toBe(true);
        });

        it('TC-HOOK-056: 여러 데코레이터가 함께 작동해야 함', async () => {
            // Given: 여러 데코레이터가 적용된 컨트롤러
            const userData = { name: 'John' };

            // When: 생성 요청
            const response = await request(app.getHttpServer())
                .post('/multi-decorated-users')
                .send(userData)
                .expect(201);

            // Then: 모든 데코레이터가 실행되어야 함
            expect(response.body.data.decoratorsExecuted).toEqual([
                'BeforeAssign',
                'AfterAssign',
                'BeforeSave',
                'AfterSave'
            ]);
        });
    });
});

// Helper functions
async function createUser(data: any) {
    // 사용자 생성 헬퍼
}

async function getProfile(userId: number) {
    // 프로필 조회 헬퍼
}

async function createPost(data: any) {
    // 포스트 생성 헬퍼
}

async function softDeletePost(id: number) {
    // 포스트 소프트 삭제 헬퍼
}

async function getPost(id: number) {
    // 포스트 조회 헬퍼
}

async function getDeletionLog(entityId: number) {
    // 삭제 로그 조회 헬퍼
}

async function getBackup(type: string, id: number) {
    // 백업 조회 헬퍼
}

async function permanentlyDeletePost(id: number) {
    // 영구 삭제 헬퍼
}

async function createComment(data: any) {
    // 댓글 생성 헬퍼
}

async function getComment(id: number) {
    // 댓글 조회 헬퍼
}

async function getRecoveryHistory(id: number) {
    // 복구 이력 조회 헬퍼
}

async function getViewLog(userId: number) {
    // 조회 로그 조회 헬퍼
}

async function getUserCount() {
    // 사용자 수 조회 헬퍼
}

async function cacheUser(user: any) {
    // 사용자 캐싱 헬퍼
}

async function getCachedUser(id: number) {
    // 캐시된 사용자 조회 헬퍼
}

async function createDecoratedUser(data: any) {
    // 데코레이터가 적용된 사용자 생성 헬퍼
}

async function createDecoratedEntity(data: any) {
    // 데코레이터가 적용된 엔티티 생성 헬퍼
}

async function softDeleteEntity(id: number) {
    // 엔티티 소프트 삭제 헬퍼
}

async function getExecutionLog(hook: string, entityId: number) {
    // 실행 로그 조회 헬퍼
}