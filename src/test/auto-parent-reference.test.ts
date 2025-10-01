import { Controller, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import request from 'supertest';
import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';

/**
 * 부모 엔티티 (Profile)
 */
@Entity('auto_parent_ref_profiles')
class Profile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @IsString()
    userId: string;

    @Column({ nullable: true })
    @IsString()
    @IsOptional()
    name?: string;

    @OneToMany(() => ProfileHighlight, (highlight) => highlight.profile, {
        nullable: true,
        cascade: ['insert', 'update'], // ✅ insert와 update 모두 cascade
    })
    @IsOptional()
    @Type(() => ProfileHighlight)
    profileHighlights?: ProfileHighlight[];
}

/**
 * 자식 엔티티 (ProfileHighlight)
 */
@Entity('auto_parent_ref_highlights')
class ProfileHighlight {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @IsString()
    before: string;

    @Column()
    @IsString()
    action: string;

    @Column()
    @IsString()
    after: string;

    @Column({ type: 'uuid' })
    @IsString()
    profileId: string;

    @ManyToOne(() => Profile, (profile) => profile.profileHighlights, {
        nullable: false,
    })
    @JoinColumn({ name: 'profileId' })
    profile: Profile;
}

class ProfileService extends CrudService<Profile> {
    constructor(
        @InjectRepository(Profile)
        repository: Repository<Profile>,
    ) {
        super(repository);
    }
}

@Crud({
    entity: Profile,
    routes: {
        create: {},
        update: {},
    },
})
@Controller('auto-parent-ref-profiles')
class ProfileController {
    constructor(public readonly crudService: ProfileService) {}
}

describe('[Auto Parent Reference] CrudService', () => {
    let app: INestApplication;
    let profileService: ProfileService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [Profile, ProfileHighlight],
                    synchronize: true,
                    logging: false,
                }),
                TypeOrmModule.forFeature([Profile, ProfileHighlight]),
            ],
            controllers: [ProfileController],
            providers: [ProfileService],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        profileService = moduleFixture.get<ProfileService>(ProfileService);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('CREATE - 자동 부모 참조 설정', () => {
        it('should auto-set parent reference for nested profileHighlights on CREATE', async () => {
            // Given: Profile 생성 요청 with nested profileHighlights
            const createDto = {
                userId: 'user-auto-ref-001',
                name: 'Test User',
                profileHighlights: [
                    { before: '헬스케어', action: '핀테크', after: '이커머스' },
                    { before: '핀테크', action: '헬스케어', after: '헬스케어' },
                ],
            };

            // When: POST /auto-parent-ref-profiles
            const response = await request(app.getHttpServer()).post('/auto-parent-ref-profiles').send(createDto).expect(201);

            // Then: profileHighlights가 저장되고 profileId가 자동 설정됨
            expect(response.body.data.id).toBeDefined();
            expect(response.body.data.userId).toBe('user-auto-ref-001');

            // 데이터베이스에서 관계 포함하여 조회
            const profile = await profileService.repository.findOne({
                where: { id: response.body.data.id },
                relations: ['profileHighlights'],
            });

            expect(profile).toBeDefined();
            expect(profile!.profileHighlights).toHaveLength(2);
            expect(profile!.profileHighlights![0].profileId).toBe(profile!.id);
            expect(profile!.profileHighlights![0].before).toBe('헬스케어');
            expect(profile!.profileHighlights![1].profileId).toBe(profile!.id);
            expect(profile!.profileHighlights![1].before).toBe('핀테크');
        });

        it('should handle CREATE with empty profileHighlights array', async () => {
            // Given: 빈 배열
            const createDto = {
                userId: 'user-auto-ref-002',
                profileHighlights: [],
            };

            // When: POST
            const response = await request(app.getHttpServer()).post('/auto-parent-ref-profiles').send(createDto).expect(201);

            // Then: 에러 없이 저장
            const profile = await profileService.repository.findOne({
                where: { id: response.body.data.id },
                relations: ['profileHighlights'],
            });

            expect(profile!.profileHighlights).toHaveLength(0);
        });

        it('should handle CREATE with no profileHighlights field', async () => {
            // Given: profileHighlights 필드 없음
            const createDto = {
                userId: 'user-auto-ref-003',
            };

            // When: POST
            const response = await request(app.getHttpServer()).post('/auto-parent-ref-profiles').send(createDto).expect(201);

            // Then: 에러 없이 저장
            expect(response.body.data.id).toBeDefined();
        });
    });

    describe('UPDATE - 자동 부모 참조 설정', () => {
        it('should auto-set parent reference for nested profileHighlights on UPDATE', async () => {
            // Given: 기존 Profile (profileHighlights 없음)
            const existingProfile = await profileService.repository.save({
                userId: 'user-auto-ref-update-001',
                name: 'Existing User',
            });

            // When: PUT /auto-parent-ref-profiles/:id with new profileHighlights
            const updateDto = {
                profileHighlights: [{ before: '핀테크', action: '헬스케어', after: '헬스케어' }],
            };

            const response = await request(app.getHttpServer()).put(`/auto-parent-ref-profiles/${existingProfile.id}`).send(updateDto);

            if (response.status !== 200) {
                console.error('Update failed:', response.status, response.body);
            }

            expect(response.status).toBe(200);

            // Then: profileHighlights가 추가되고 profileId가 자동 설정됨
            const updatedProfile = await profileService.repository.findOne({
                where: { id: existingProfile.id },
                relations: ['profileHighlights'],
            });

            expect(updatedProfile!.profileHighlights).toHaveLength(1);
            expect(updatedProfile!.profileHighlights![0].profileId).toBe(existingProfile.id);
            expect(updatedProfile!.profileHighlights![0].before).toBe('핀테크');
        });

        it('should handle UPDATE with empty array', async () => {
            // Given: 기존 Profile
            const existingProfile = await profileService.repository.save({
                userId: 'user-auto-ref-update-002',
            });

            // When: 빈 배열로 업데이트
            const updateDto = { profileHighlights: [] };
            await request(app.getHttpServer()).put(`/auto-parent-ref-profiles/${existingProfile.id}`).send(updateDto).expect(200);

            // Then: 에러 없이 처리
            const profile = await profileService.repository.findOne({
                where: { id: existingProfile.id },
                relations: ['profileHighlights'],
            });
            expect(profile!.profileHighlights).toHaveLength(0);
        });
    });
});
