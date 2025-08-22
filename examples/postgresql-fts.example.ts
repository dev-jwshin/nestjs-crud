/**
 * PostgreSQL 전문 검색(Full-Text Search) 사용 예제
 * 
 * 이 예제는 PostgreSQL의 GIN 인덱스와 to_tsvector/plainto_tsquery를 활용한
 * 고성능 전문 검색 기능을 보여줍니다.
 */

import { Controller, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column, Repository } from 'typeorm';
import { IsString, IsOptional } from 'class-validator';
import { Crud, CrudService, QueryConverter } from '@foryourdev/nestjs-crud';

// ============================================
// 📝 Post Entity (게시글)
// ============================================
@Entity()
export class Post {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    title: string;

    @Column('text')
    @IsString()
    content: string;

    @Column({ default: 'draft' })
    @IsOptional()
    @IsString()
    status: 'draft' | 'published' | 'archived';

    @Column()
    authorId: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}

// ============================================
// 🔧 Post Service
// ============================================
@Injectable()
export class PostService extends CrudService<Post> {
    constructor(@InjectRepository(Post) repository: Repository<Post>) {
        super(repository);
    }

    /**
     * PostgreSQL GIN 인덱스 생성을 위한 SQL 생성
     */
    generateFullTextIndexes(): string[] {
        return [
            // 제목 전문 검색 인덱스
            QueryConverter.generateGinIndexSQL('post', 'title', 'korean'),
            
            // 내용 전문 검색 인덱스
            QueryConverter.generateGinIndexSQL('post', 'content', 'korean'),
            
            // 제목 + 내용 복합 전문 검색 인덱스 (수동 작성)
            `CREATE INDEX CONCURRENTLY idx_post_title_content_fts 
             ON post USING GIN (
                 to_tsvector('korean', 
                     coalesce(title, '') || ' ' || coalesce(content, '')
                 )
             );`
        ];
    }
}

// ============================================
// 🎯 Post Controller with Full-Text Search
// ============================================
@Controller('posts')
@Crud({
    entity: Post,
    allowedParams: ['title', 'content', 'status', 'authorId'],
    allowedFilters: [
        'title', 'content', 'status', 'authorId', 'createdAt',
        // 💡 전문 검색을 위해 필터에 포함
        'title_fts', 'content_fts'
    ],
    exclude: [],
    routes: {
        create: { enabled: true },
        read: { enabled: true },
        update: { enabled: true },
        destroy: { enabled: true, softDelete: false }
    }
})
export class PostController {
    constructor(public readonly crudService: PostService) {
        // 시작 시 인덱스 생성 SQL 출력 (개발용)
        console.log('=== PostgreSQL 전문 검색 인덱스 생성 SQL ===');
        const indexSQLs = this.crudService.generateFullTextIndexes();
        indexSQLs.forEach((sql, index) => {
            console.log(`${index + 1}. ${sql}`);
        });
        console.log('=============================================');
    }
}

// ============================================
// 📚 API 사용 예제
// ============================================
/*

1. 기본 전문 검색:
   GET /posts?filter[title_fts]=NestJS 개발

2. 내용에서 전문 검색:
   GET /posts?filter[content_fts]=TypeScript 마이크로서비스

3. 전문 검색 + 일반 필터 조합:
   GET /posts?filter[title_fts]=개발자&filter[status_eq]=published

4. 전문 검색 + 정렬 + 페이지네이션:
   GET /posts?filter[content_fts]=React Vue Angular&sort=-createdAt&page[limit]=10

5. 복잡한 검색 조합:
   GET /posts?filter[title_fts]=프론트엔드&filter[content_fts]=JavaScript&filter[status_in]=published,draft&sort=createdAt

데이터베이스별 지원:
✅ PostgreSQL: 완전 지원 (GIN 인덱스 권장)
❌ MySQL: 지원 안함 (_like, _contains 사용)
❌ SQLite: 지원 안함 (_like, _contains 사용)
❌ MongoDB: 지원 안함 (MongoDB text search는 별도 구현 필요)

*/

// ============================================
// 🗃️ 마이그레이션 예제 (수동 실행 필요)
// ============================================
/*

-- 1. 기본 테이블 생성 후 실행
-- 2. 인덱스 생성 (성능 최적화)

-- 제목 전문 검색 인덱스
CREATE INDEX CONCURRENTLY idx_post_title_fts 
ON post USING GIN (to_tsvector('korean', title));

-- 내용 전문 검색 인덱스  
CREATE INDEX CONCURRENTLY idx_post_content_fts 
ON post USING GIN (to_tsvector('korean', content));

-- 복합 전문 검색 인덱스 (제목 + 내용)
CREATE INDEX CONCURRENTLY idx_post_title_content_fts 
ON post USING GIN (
    to_tsvector('korean', 
        coalesce(title, '') || ' ' || coalesce(content, '')
    )
);

-- 3. 인덱스 생성 확인
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'post' 
AND indexname LIKE '%_fts';

-- 4. 전문 검색 테스트
SELECT id, title, content
FROM post 
WHERE to_tsvector('korean', title) @@ plainto_tsquery('korean', 'NestJS');

*/