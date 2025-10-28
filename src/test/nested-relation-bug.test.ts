import { Controller, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    Column,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    Repository,
} from 'typeorm';
import { InjectRepository, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { IsOptional } from 'class-validator';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';

// 순환 참조를 해결하기 위해 인터페이스를 먼저 선언
interface Job {
    id: string;
    title: string;
    profiles?: Profile[];
}

interface ProfileExperience {
    id: string;
    company: string;
    role: string;
    profileId: string;
    profile?: any;
}

interface FeaturedProfile {
    id: string;
    profileId: string;
    enabled: boolean;
    profile?: any;
}

interface Profile {
    id: string;
    userId: string;
    name?: string;
    jobs?: Job[];
    profileExperiences?: ProfileExperience[];
    featuredProfile?: FeaturedProfile;
}

/**
 * Job 엔티티
 */
@Entity('nested_bug_jobs')
class Job {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @ManyToMany(() => Profile, (profile) => profile.jobs)
    profiles?: Profile[];
}

/**
 * ProfileExperience 엔티티
 */
@Entity('nested_bug_profile_experiences')
class ProfileExperience {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    company: string;

    @Column()
    role: string;

    @Column({ type: 'uuid' })
    profileId: string;

    @ManyToOne(() => Profile, (profile) => profile.profileExperiences, {
        nullable: false,
    })
    @JoinColumn({ name: 'profileId' })
    profile?: any;
}

/**
 * FeaturedProfile 엔티티 (실제 문제 시나리오)
 */
@Entity('nested_bug_featured_profiles')
class FeaturedProfile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    profileId: string;

    @Column({ default: true })
    enabled: boolean;

    @OneToOne(() => Profile, (profile) => profile.featuredProfile, {
        nullable: false,
        eager: false,
    })
    @JoinColumn({ name: 'profileId' })
    profile?: any;
}

/**
 * Profile 엔티티
 */
@Entity('nested_bug_profiles')
class Profile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @Column({ nullable: true })
    @IsOptional()
    name?: string;

    @ManyToMany(() => Job, (job) => job.profiles, {
        nullable: true,
        eager: false,
        cascade: false,
    })
    @JoinTable({
        name: 'nested_bug_profile_jobs',
        joinColumn: { name: 'profileId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'jobId', referencedColumnName: 'id' },
    })
    @IsOptional()
    jobs?: Job[];

    @OneToMany(() => ProfileExperience, (exp) => exp.profile, {
        nullable: true,
        cascade: ['insert', 'update'],
    })
    @IsOptional()
    profileExperiences?: ProfileExperience[];

    @OneToOne(() => FeaturedProfile, (fp) => fp.profile)
    featuredProfile?: FeaturedProfile;
}

class FeaturedProfileService extends CrudService<FeaturedProfile> {
    constructor(
        @InjectRepository(FeaturedProfile)
        repository: Repository<FeaturedProfile>,
    ) {
        super(repository);
    }
}

@Crud({
    entity: FeaturedProfile,
    routes: {
        index: {
            allowedIncludes: [
                'profile',
                'profile.jobs',
                'profile.profileExperiences',
            ],
            allowedFilters: ['enabled'],
        },
        show: {
            allowedIncludes: [
                'profile',
                'profile.jobs',
                'profile.profileExperiences',
            ],
        },
    },
})
@Controller('nested-bug-featured-profiles')
class FeaturedProfileController {
    constructor(public readonly crudService: FeaturedProfileService) {}
}

describe('[Nested Relations Bug] FeaturedProfile > Profile > jobs/profileExperiences', () => {
    let app: INestApplication;
    let featuredProfileService: FeaturedProfileService;
    let profileRepository: Repository<Profile>;
    let jobRepository: Repository<Job>;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [FeaturedProfile, Profile, Job, ProfileExperience],
                    synchronize: true,
                    logging: true,
                }),
                TypeOrmModule.forFeature([FeaturedProfile, Profile, Job, ProfileExperience]),
            ],
            controllers: [FeaturedProfileController],
            providers: [FeaturedProfileService],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        featuredProfileService = moduleFixture.get<FeaturedProfileService>(FeaturedProfileService);
        profileRepository = moduleFixture.get<Repository<Profile>>(getRepositoryToken(Profile));
        jobRepository = moduleFixture.get<Repository<Job>>(getRepositoryToken(Job));
    });

    // 각 테스트 전에 데이터 정리
    beforeEach(async () => {
        const profileExperienceRepository = app.get<Repository<ProfileExperience>>(getRepositoryToken(ProfileExperience));

        // 순서대로 삭제 (외래 키 제약조건 때문)
        await featuredProfileService.repository.delete({});
        await profileExperienceRepository.delete({});
        await profileRepository.query('DELETE FROM nested_bug_profile_jobs');
        await profileRepository.delete({});
        await jobRepository.delete({});
    });

    afterAll(async () => {
        await app.close();
    });

    describe('중첩 관계 로딩 버그', () => {
        it('🔴 BUG: profile.jobs가 누락됨 when profile.profileExperiences included', async () => {
            // Given: Job 데이터 생성
            const job1 = await jobRepository.save({ title: 'Backend Developer' });
            const job2 = await jobRepository.save({ title: 'Frontend Developer' });

            // Given: Profile 생성 (jobs와 profileExperiences 포함)
            const profile = await profileRepository.save({
                userId: 'user-nested-001',
                name: 'Test User',
                jobs: [job1, job2],
                profileExperiences: [
                    { company: 'Tech Corp', role: 'Developer', profileId: '' }, // profileId는 save 후 자동 설정됨
                ],
            } as any);

            // Given: FeaturedProfile 생성
            const featuredProfile = await featuredProfileService.repository.save({
                profileId: profile.id,
                enabled: true,
            });

            // When: 모든 중첩 관계 포함하여 조회
            const response = await request(app.getHttpServer())
                .get(`/nested-bug-featured-profiles/${featuredProfile.id}?include=profile,profile.jobs,profile.profileExperiences`)
                .expect(200);

            // Then: 모든 관계가 로딩되어야 함
            expect(response.body.data).toBeDefined();
            expect(response.body.data.profile).toBeDefined();

            // ✅ FIX: profile.jobs가 정상적으로 로딩되어야 함
            expect(response.body.data.profile.jobs).toBeDefined();
            expect(Array.isArray(response.body.data.profile.jobs)).toBe(true);
            expect(response.body.data.profile.jobs.length).toBe(2);
            expect(response.body.data.profile.jobs[0].title).toBeDefined();
            expect(response.body.data.profile.jobs[1].title).toBeDefined();

            expect(response.body.data.profile.profileExperiences).toBeDefined();
            expect(response.body.data.profile.profileExperiences.length).toBe(1);
            expect(response.body.data.profile.profileExperiences[0].company).toBe('Tech Corp');
        });

        it('✅ WORKS: profile.jobs loads correctly WITHOUT profile.profileExperiences', async () => {
            // Given: Job 데이터 생성
            const job1 = await jobRepository.save({ title: 'DevOps Engineer' });
            const job2 = await jobRepository.save({ title: 'QA Engineer' });

            // Given: Profile 생성 (jobs만 포함, profileExperiences 없음)
            const profile = await profileRepository.save({
                userId: 'user-nested-002',
                name: 'Test User 2',
                jobs: [job1, job2],
            } as any);

            // Given: FeaturedProfile 생성
            const featuredProfile = await featuredProfileService.repository.save({
                profileId: profile.id,
                enabled: true,
            });

            // When: profile.profileExperiences 제외하고 조회
            const response = await request(app.getHttpServer())
                .get(`/nested-bug-featured-profiles/${featuredProfile.id}?include=profile,profile.jobs`)
                .expect(200);

            // Then: jobs가 정상적으로 로딩됨
            expect(response.body.data.profile).toBeDefined();
            expect(response.body.data.profile.jobs).toBeDefined();
            expect(response.body.data.profile.jobs.length).toBe(2); // ✅ 성공 예상
        });

        it('🔍 INDEX: Check index endpoint with multiple featured profiles', async () => {
            // Given: 2개의 FeaturedProfile 생성
            const job1 = await jobRepository.save({ title: 'Backend Developer' });
            const job2 = await jobRepository.save({ title: 'Frontend Developer' });
            const job3 = await jobRepository.save({ title: 'Data Scientist' });

            const profile1 = await profileRepository.save({
                userId: 'user-index-001',
                name: 'Index User 1',
                jobs: [job1, job2],
                profileExperiences: [
                    { company: 'Tech Corp', role: 'Developer', profileId: '' },
                ],
            } as any);

            const profile2 = await profileRepository.save({
                userId: 'user-index-002',
                name: 'Index User 2',
                jobs: [job3],
                profileExperiences: [
                    { company: 'Data Corp', role: 'Analyst', profileId: '' },
                ],
            } as any);

            const fp1 = await featuredProfileService.repository.save({
                profileId: profile1.id,
                enabled: true,
            });

            await featuredProfileService.repository.save({
                profileId: profile2.id,
                enabled: true,
            });

            // When: 목록 조회 (필터 없이 전체 조회)
            const response = await request(app.getHttpServer())
                .get('/nested-bug-featured-profiles?include=profile,profile.jobs,profile.profileExperiences')
                .expect(200);

            // Then: 각 FeaturedProfile의 profile.jobs 확인
            expect(response.body.data).toBeDefined();
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThanOrEqual(2);

            // 모든 FeaturedProfile이 profile.jobs를 가져야 함
            response.body.data.forEach((fp: any) => {
                expect(fp.profile).toBeDefined();
                expect(fp.profile.jobs).toBeDefined();
                expect(Array.isArray(fp.profile.jobs)).toBe(true);
                expect(fp.profile.jobs.length).toBeGreaterThan(0);

                // jobs 데이터 검증
                expect(fp.profile.jobs[0].title).toBeDefined();

                expect(fp.profile.profileExperiences).toBeDefined();
                expect(Array.isArray(fp.profile.profileExperiences)).toBe(true);
                expect(fp.profile.profileExperiences.length).toBeGreaterThan(0);
            });
        });
    });
});
