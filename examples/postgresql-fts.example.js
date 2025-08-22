"use strict";
/**
 * PostgreSQL 전문 검색(Full-Text Search) 사용 예제
 *
 * 이 예제는 PostgreSQL의 GIN 인덱스와 to_tsvector/plainto_tsquery를 활용한
 * 고성능 전문 검색 기능을 보여줍니다.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostController = exports.PostService = exports.Post = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const class_validator_1 = require("class-validator");
const nestjs_crud_1 = require("@foryourdev/nestjs-crud");
// ============================================
// 📝 Post Entity (게시글)
// ============================================
let Post = class Post {
};
exports.Post = Post;
tslib_1.__decorate([
    (0, typeorm_2.PrimaryGeneratedColumn)(),
    tslib_1.__metadata("design:type", Number)
], Post.prototype, "id", void 0);
tslib_1.__decorate([
    (0, typeorm_2.Column)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Post.prototype, "title", void 0);
tslib_1.__decorate([
    (0, typeorm_2.Column)('text'),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Post.prototype, "content", void 0);
tslib_1.__decorate([
    (0, typeorm_2.Column)({ default: 'draft' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], Post.prototype, "status", void 0);
tslib_1.__decorate([
    (0, typeorm_2.Column)(),
    tslib_1.__metadata("design:type", Number)
], Post.prototype, "authorId", void 0);
tslib_1.__decorate([
    (0, typeorm_2.Column)({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }),
    tslib_1.__metadata("design:type", Date)
], Post.prototype, "createdAt", void 0);
exports.Post = Post = tslib_1.__decorate([
    (0, typeorm_2.Entity)()
], Post);
// ============================================
// 🔧 Post Service
// ============================================
let PostService = class PostService extends nestjs_crud_1.CrudService {
    constructor(repository) {
        super(repository);
    }
    /**
     * PostgreSQL GIN 인덱스 생성을 위한 SQL 생성
     */
    generateFullTextIndexes() {
        return [
            // 제목 전문 검색 인덱스
            nestjs_crud_1.QueryConverter.generateGinIndexSQL('post', 'title', 'korean'),
            // 내용 전문 검색 인덱스
            nestjs_crud_1.QueryConverter.generateGinIndexSQL('post', 'content', 'korean'),
            // 제목 + 내용 복합 전문 검색 인덱스 (수동 작성)
            `CREATE INDEX CONCURRENTLY idx_post_title_content_fts 
             ON post USING GIN (
                 to_tsvector('korean', 
                     coalesce(title, '') || ' ' || coalesce(content, '')
                 )
             );`
        ];
    }
};
exports.PostService = PostService;
exports.PostService = PostService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, typeorm_1.InjectRepository)(Post)),
    tslib_1.__metadata("design:paramtypes", [typeorm_2.Repository])
], PostService);
// ============================================
// 🎯 Post Controller with Full-Text Search
// ============================================
let PostController = class PostController {
    constructor(crudService) {
        this.crudService = crudService;
        // 시작 시 인덱스 생성 SQL 출력 (개발용)
        console.log('=== PostgreSQL 전문 검색 인덱스 생성 SQL ===');
        const indexSQLs = this.crudService.generateFullTextIndexes();
        indexSQLs.forEach((sql, index) => {
            console.log(`${index + 1}. ${sql}`);
        });
        console.log('=============================================');
    }
};
exports.PostController = PostController;
exports.PostController = PostController = tslib_1.__decorate([
    (0, common_1.Controller)('posts'),
    (0, nestjs_crud_1.Crud)({
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
    }),
    tslib_1.__metadata("design:paramtypes", [PostService])
], PostController);
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
//# sourceMappingURL=postgresql-fts.example.js.map