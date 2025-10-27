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
    PrimaryGeneratedColumn,
    Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import request from 'supertest';
import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

import { Crud } from '../lib/crud.decorator';
import { CrudService } from '../lib/crud.service';

/**
 * Profile 엔티티
 * - ManyToMany 관계: jobs
 * - OneToMany 관계: profileExperiences
 */
@Entity('relation_bug_profiles')
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

    @ManyToMany('Job', 'profiles', {
        nullable: true,
        eager: false,  // ✅ 실제 환경과 동일
        cascade: false,
    })
    @JoinTable({
        name: 'relation_bug_profile_jobs',
        joinColumn: { name: 'profileId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'jobId', referencedColumnName: 'id' },
    })
    @IsOptional()
    jobs?: Job[];

    @OneToMany('ProfileExperience', 'profile', {
        nullable: true,
        cascade: ['insert', 'update'],
    })
    @IsOptional()
    profileExperiences?: ProfileExperience[];
}

/**
 * Job 엔티티 (ManyToMany 관계)
 */
@Entity('relation_bug_jobs')
class Job {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @IsString()
    title: string;

    @ManyToMany('Profile', 'jobs')
    profiles?: Profile[];
}

/**
 * ProfileExperience 엔티티 (OneToMany 관계)
 */
@Entity('relation_bug_profile_experiences')
class ProfileExperience {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    @IsString()
    company: string;

    @Column()
    @IsString()
    role: string;

    @Column({ type: 'uuid' })
    @IsString()
    profileId: string;

    @ManyToOne('Profile', 'profileExperiences', {
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
        index: {
            allowedIncludes: ['jobs', 'profileExperiences'],
        },
        show: {
            allowedIncludes: ['jobs', 'profileExperiences'],
        },
    },
})
@Controller('relation-bug-profiles')
class ProfileController {
    constructor(public readonly crudService: ProfileService) {}
}

describe('[TypeORM Relation Loading Bug] ManyToMany + OneToMany 동시 로딩', () => {
    let app: INestApplication;
    let profileService: ProfileService;
    let jobRepository: Repository<Job>;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    entities: [Profile, Job, ProfileExperience],
                    synchronize: true,
                    logging: true, // 🔍 SQL 로깅 활성화
                }),
                TypeOrmModule.forFeature([Profile, Job, ProfileExperience]),
            ],
            controllers: [ProfileController],
            providers: [ProfileService],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        profileService = moduleFixture.get<ProfileService>(ProfileService);
        jobRepository = moduleFixture.get('JobRepository');
    });

    afterAll(async () => {
        await app.close();
    });

    // beforeEach는 FK 제약조건 문제로 제거
    // 각 테스트가 독립적으로 실행됨

    describe('관계 로딩 버그 재현', () => {
        it('should load both ManyToMany (jobs) and OneToMany (profileExperiences) correctly', async () => {
            // Given: Job 데이터 생성
            const job1 = await jobRepository.save({ title: 'Software Engineer' });
            const job2 = await jobRepository.save({ title: 'Product Manager' });

            // Given: Profile 생성 (jobs와 profileExperiences 포함)
            const profile = await profileService.repository.save({
                userId: 'user-001',
                name: 'John Doe',
                jobs: [job1, job2],
                profileExperiences: [
                    { company: 'Company A', role: 'Engineer' },
                    { company: 'Company B', role: 'Senior Engineer' },
                ],
            } as any);

            console.log('\n📝 Created Profile ID:', profile.id);

            // When: include=jobs,profileExperiences로 조회
            const response = await request(app.getHttpServer())
                .get(`/relation-bug-profiles/${profile.id}?include=jobs,profileExperiences`)
                .expect(200);

            console.log('\n✅ Response Body:', JSON.stringify(response.body, null, 2));

            // Then: jobs와 profileExperiences 모두 로딩되어야 함
            expect(response.body.data).toBeDefined();
            expect(response.body.data.id).toBe(profile.id);

            // ⚠️ BUG CHECK: jobs 데이터가 누락되는가?
            expect(response.body.data.jobs).toBeDefined();
            expect(response.body.data.jobs).toHaveLength(2);
            // 순서가 바뀔 수 있으므로 title로 검색
            const jobTitles = response.body.data.jobs.map((j: any) => j.title).sort();
            expect(jobTitles).toEqual(['Product Manager', 'Software Engineer']);

            // ⚠️ BUG CHECK: profileExperiences 데이터가 누락되는가?
            expect(response.body.data.profileExperiences).toBeDefined();
            expect(response.body.data.profileExperiences).toHaveLength(2);
            expect(response.body.data.profileExperiences[0].company).toBe('Company A');
            expect(response.body.data.profileExperiences[1].company).toBe('Company B');
        });

        it('should handle readMany with both relations', async () => {
            // Given: Job 데이터 생성
            const job1 = await jobRepository.save({ title: 'Backend Developer' });
            const job2 = await jobRepository.save({ title: 'Frontend Developer' });

            // Given: 여러 개의 Profile 생성
            await profileService.repository.save([
                {
                    userId: 'user-many-001',
                    name: 'Alice',
                    jobs: [job1],
                    profileExperiences: [{ company: 'Tech Corp', role: 'Developer' }],
                } as any,
                {
                    userId: 'user-many-002',
                    name: 'Bob',
                    jobs: [job2],
                    profileExperiences: [{ company: 'Startup Inc', role: 'Lead Engineer' }],
                } as any,
            ]);

            // When: include=jobs,profileExperiences로 목록 조회
            const response = await request(app.getHttpServer())
                .get('/relation-bug-profiles?include=jobs,profileExperiences')
                .expect(200);

            console.log('\n✅ ReadMany Response:', JSON.stringify(response.body, null, 2));

            // Then: 모든 Profile에 jobs와 profileExperiences가 로딩되어야 함
            expect(response.body.data).toHaveLength(2);

            // First profile
            const firstProfile = response.body.data.find((p: any) => p.name === 'Alice');
            expect(firstProfile.jobs).toBeDefined();
            expect(firstProfile.jobs).toHaveLength(1);
            expect(firstProfile.jobs[0].title).toBe('Backend Developer');
            expect(firstProfile.profileExperiences).toBeDefined();
            expect(firstProfile.profileExperiences).toHaveLength(1);

            // Second profile
            const secondProfile = response.body.data.find((p: any) => p.name === 'Bob');
            expect(secondProfile.jobs).toBeDefined();
            expect(secondProfile.jobs).toHaveLength(1);
            expect(secondProfile.jobs[0].title).toBe('Frontend Developer');
            expect(secondProfile.profileExperiences).toBeDefined();
            expect(secondProfile.profileExperiences).toHaveLength(1);
        });

        it('should load only jobs when only jobs is included', async () => {
            // Given: Job 데이터 생성
            const job = await jobRepository.save({ title: 'DevOps Engineer' });

            // Given: Profile 생성
            const profile = await profileService.repository.save({
                userId: 'user-002',
                name: 'Charlie',
                jobs: [job],
                profileExperiences: [{ company: 'Cloud Inc', role: 'DevOps' }],
            } as any);

            // When: include=jobs만 지정
            const response = await request(app.getHttpServer())
                .get(`/relation-bug-profiles/${profile.id}?include=jobs`)
                .expect(200);

            // Then: jobs만 로딩되고 profileExperiences는 undefined
            expect(response.body.data.jobs).toBeDefined();
            expect(response.body.data.jobs).toHaveLength(1);
            expect(response.body.data.profileExperiences).toBeUndefined();
        });

        it('should load only profileExperiences when only profileExperiences is included', async () => {
            // Given: Job 데이터 생성
            const job = await jobRepository.save({ title: 'QA Engineer' });

            // Given: Profile 생성
            const profile = await profileService.repository.save({
                userId: 'user-003',
                name: 'David',
                jobs: [job],
                profileExperiences: [{ company: 'Test Corp', role: 'QA Lead' }],
            } as any);

            // When: include=profileExperiences만 지정
            const response = await request(app.getHttpServer())
                .get(`/relation-bug-profiles/${profile.id}?include=profileExperiences`)
                .expect(200);

            // Then: profileExperiences만 로딩되고 jobs는 undefined
            expect(response.body.data.profileExperiences).toBeDefined();
            expect(response.body.data.profileExperiences).toHaveLength(1);
            expect(response.body.data.jobs).toBeUndefined();
        });
    });
});
