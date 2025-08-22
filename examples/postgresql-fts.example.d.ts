/**
 * PostgreSQL 전문 검색(Full-Text Search) 사용 예제
 *
 * 이 예제는 PostgreSQL의 GIN 인덱스와 to_tsvector/plainto_tsquery를 활용한
 * 고성능 전문 검색 기능을 보여줍니다.
 */
import { Repository } from 'typeorm';
import { CrudService } from '@foryourdev/nestjs-crud';
export declare class Post {
    id: number;
    title: string;
    content: string;
    status: 'draft' | 'published' | 'archived';
    authorId: number;
    createdAt: Date;
}
export declare class PostService extends CrudService<Post> {
    constructor(repository: Repository<Post>);
    /**
     * PostgreSQL GIN 인덱스 생성을 위한 SQL 생성
     */
    generateFullTextIndexes(): string[];
}
export declare class PostController {
    readonly crudService: PostService;
    constructor(crudService: PostService);
}
