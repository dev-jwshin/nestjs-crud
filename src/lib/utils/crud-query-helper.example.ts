/**
 * CrudQueryHelper 사용 예제
 * 
 * 이 파일은 route를 오버라이드할 때 CrudQueryHelper를 사용하는 방법을 보여줍니다.
 */

import { Controller, Get, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Crud } from '../crud.decorator';
import { CrudService } from '../crud.service';
import { CrudQueryHelper } from './crud-query-helper';

// 예제 Entity
class User {
    id: number;
    name: string;
    email: string;
    age: number;
    status: string;
    createdAt: Date;
}

// 예제 Service
class UserService extends CrudService<User> {
    constructor(
        @InjectRepository(User)
        repository: Repository<User>,
    ) {
        super(repository);
    }
}

/**
 * 예제 1: 기본적인 페이지네이션, 필터링, 정렬
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example1Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * index route 오버라이드 - 간단한 방법
     * GET /users?page=1&limit=10&status=active&sort=-createdAt
     */
    @Get()
    async index(@Req() req: Request) {
        // 1. 파라미터 추출
        const pagination = CrudQueryHelper.extractPaginationParams(req);
        const filters = CrudQueryHelper.extractFilterParams(req, ['status', 'age', 'name']);
        const sort = CrudQueryHelper.extractSortParams(req);

        // 2. QueryBuilder 생성
        const qb = this.userRepository.createQueryBuilder('user');

        // 3. 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(qb, filters);

        // 4. 정렬 적용
        CrudQueryHelper.applySortToQueryBuilder(qb, sort);

        // 5. 페이지네이션 적용 및 결과 반환
        return CrudQueryHelper.applyPaginationToQueryBuilder(qb, pagination);
    }
}

/**
 * 예제 2: 한 번에 모든 기능 적용
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example2Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * index route 오버라이드 - 더 간단한 방법
     * GET /users?page=1&limit=10&status=active&age=>18&sort=-createdAt
     */
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // 한 번에 모든 파라미터 적용
        return CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
            allowedFilterFields: ['status', 'age', 'name', 'email'],
            defaultLimit: 20,
            alias: 'user'
        });
    }
}

/**
 * 예제 3: Repository를 직접 사용한 간단한 페이지네이션
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example3Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * 활성 사용자만 조회
     * GET /users/active?page=2&limit=15
     */
    @Get('active')
    async getActiveUsers(@Req() req: Request) {
        const pagination = CrudQueryHelper.extractPaginationParams(req, 15);
        
        return CrudQueryHelper.paginate(
            this.userRepository,
            {
                where: { status: 'active' },
                order: { createdAt: 'DESC' }
            },
            pagination
        );
    }
}

/**
 * 예제 4: 복잡한 필터링 사용
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example4Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * 다양한 필터 연산자 사용
     * GET /users?name=John*&age=>18&age=<65&status=active,pending&email!=test@test.com
     */
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // 파라미터 추출
        const params = CrudQueryHelper.extractAllParams(req);
        
        // 커스텀 로직 추가 가능
        if (params.filters.age) {
            // 나이 범위 체크 등 커스텀 로직
            console.log('Age filter applied:', params.filters.age);
        }
        
        // 필터 적용
        CrudQueryHelper.applyFiltersToQueryBuilder(qb, params.filters);
        
        // 정렬 적용
        if (params.sort.length > 0) {
            CrudQueryHelper.applySortToQueryBuilder(qb, params.sort);
        } else {
            // 기본 정렬
            qb.orderBy('user.createdAt', 'DESC');
        }
        
        // 페이지네이션 적용
        return CrudQueryHelper.applyPaginationToQueryBuilder(qb, params.pagination);
    }
}

/**
 * 예제 5: 관계 포함한 조회
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example5Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * 관계를 포함한 조회
     * GET /users?page=1&limit=10&include=posts,profile
     */
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // 관계 포함 (include 파라미터 처리)
        const include = req.query.include as string;
        if (include) {
            const relations = include.split(',');
            relations.forEach(relation => {
                qb.leftJoinAndSelect(`user.${relation}`, relation);
            });
        }
        
        // 모든 쿼리 파라미터 적용
        return CrudQueryHelper.applyAllToQueryBuilder(qb, req, {
            allowedFilterFields: ['status', 'age', 'name'],
            defaultLimit: 10
        });
    }
}

/**
 * 예제 6: 커스텀 응답 포맷
 */
@Controller('users')
@Crud({
    entity: User,
})
export class Example6Controller {
    constructor(
        public readonly crudService: UserService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    /**
     * 커스텀 응답 포맷으로 변환
     */
    @Get()
    async index(@Req() req: Request) {
        const qb = this.userRepository.createQueryBuilder('user');
        
        // 쿼리 실행
        const result = await CrudQueryHelper.applyAllToQueryBuilder(qb, req);
        
        // 커스텀 응답 포맷으로 변환
        return {
            success: true,
            data: result.data.map(user => ({
                ...user,
                displayName: `${user.name} (${user.email})`
            })),
            pagination: {
                currentPage: result.metadata.page,
                totalPages: result.metadata.totalPages,
                pageSize: result.metadata.limit,
                totalItems: result.metadata.total,
                hasNextPage: result.metadata.hasNext,
                hasPreviousPage: result.metadata.hasPrevious
            }
        };
    }
}

/**
 * 사용 가능한 쿼리 파라미터 예제:
 * 
 * 페이지네이션:
 * - ?page=2&limit=20
 * - ?offset=40&limit=20
 * 
 * 필터링:
 * - ?status=active (일치)
 * - ?name=John* (LIKE 검색, *를 와일드카드로 사용)
 * - ?age=>18 (보다 큼)
 * - ?age=>=18 (크거나 같음)
 * - ?age=<65 (보다 작음)
 * - ?age=<=65 (작거나 같음)
 * - ?email!=test@test.com (같지 않음)
 * - ?status=active,pending (IN 연산자, 콤마로 구분)
 * - ?deletedAt=null (NULL 체크)
 * - ?deletedAt=!null (NOT NULL 체크)
 * - ?where={"age":{"$gte":18,"$lte":65}} (JSON 형식)
 * 
 * 정렬:
 * - ?sort=name (오름차순)
 * - ?sort=-createdAt (내림차순, - 붙임)
 * - ?sort=+name (명시적 오름차순)
 * - ?sort=status,-createdAt (복수 정렬)
 */