import type { FindOptionsRelations, SelectQueryBuilder, ObjectLiteral } from 'typeorm';

/**
 * RelationsHelper
 *
 * TypeORM의 FindOptionsRelations를 QueryBuilder의 leftJoinAndSelect로 변환하는 유틸리티
 * 중첩된 ManyToMany 관계를 올바르게 로딩하기 위해 사용
 */
export class RelationsHelper {
    /**
     * FindOptionsRelations에 중첩 관계가 포함되어 있는지 확인
     *
     * @example
     * hasNestedRelations({ profile: { jobs: true } }) // true
     * hasNestedRelations({ profile: true }) // false
     * hasNestedRelations(['profile', 'jobs']) // false (string array는 중첩 없음)
     */
    static hasNestedRelations(relations?: FindOptionsRelations<any> | string[]): boolean {
        if (!relations) {
            return false;
        }

        // string[]인 경우 중첩 관계 없음
        if (Array.isArray(relations)) {
            return false;
        }

        // 객체인 경우 중첩 관계 확인
        if (typeof relations === 'object') {
            return Object.values(relations).some((value) => {
                if (typeof value === 'object' && value !== null) {
                    // 중첩 객체가 있으면 true
                    return true;
                }
                return false;
            });
        }

        return false;
    }

    /**
     * FindOptionsRelations를 QueryBuilder에 leftJoinAndSelect로 적용
     *
     * @param queryBuilder - TypeORM QueryBuilder
     * @param relations - FindOptionsRelations 객체
     * @param parentAlias - 부모 엔티티 alias (기본값: queryBuilder.alias)
     *
     * @example
     * const qb = repository.createQueryBuilder('fp');
     * RelationsHelper.applyRelations(qb, {
     *   profile: {
     *     jobs: true,
     *     profileExperiences: true
     *   }
     * });
     * // 결과:
     * // .leftJoinAndSelect('fp.profile', 'profile')
     * // .leftJoinAndSelect('profile.jobs', 'profile_jobs')
     * // .leftJoinAndSelect('profile.profileExperiences', 'profile_profileExperiences')
     */
    static applyRelations<T extends ObjectLiteral>(
        queryBuilder: SelectQueryBuilder<T>,
        relations: FindOptionsRelations<T>,
        parentAlias?: string,
    ): void {
        const baseAlias = parentAlias || queryBuilder.alias;
        this.applyRelationsRecursive(queryBuilder, relations, baseAlias);
    }

    /**
     * 재귀적으로 중첩된 관계를 QueryBuilder에 적용
     */
    private static applyRelationsRecursive(
        queryBuilder: SelectQueryBuilder<any>,
        relations: FindOptionsRelations<any>,
        parentAlias: string,
        level: number = 0,
    ): void {
        // 최대 깊이 제한 (순환 참조 방지)
        if (level > 5) {
            console.warn(`[RelationsHelper] Maximum nesting level (5) exceeded for alias: ${parentAlias}`);
            return;
        }

        for (const [relationName, relationValue] of Object.entries(relations)) {
            if (!relationValue) continue;

            // 관계 alias 생성 (예: "profile_jobs", "profile_profileExperiences")
            const relationAlias = `${parentAlias}_${relationName}`;
            const relationPath = `${parentAlias}.${relationName}`;

            // leftJoinAndSelect 추가
            queryBuilder.leftJoinAndSelect(relationPath, relationAlias);

            // 중첩 관계가 있으면 재귀 호출
            if (typeof relationValue === 'object' && relationValue !== null) {
                this.applyRelationsRecursive(
                    queryBuilder,
                    relationValue as FindOptionsRelations<any>,
                    relationAlias,
                    level + 1,
                );
            }
        }
    }

    /**
     * FindOptionsRelations를 평탄화된 배열로 변환 (디버깅용)
     *
     * @example
     * flattenRelations({ profile: { jobs: true, user: true } })
     * // ['profile', 'profile.jobs', 'profile.user']
     */
    static flattenRelations(relations: FindOptionsRelations<any>, prefix: string = ''): string[] {
        const result: string[] = [];

        for (const [key, value] of Object.entries(relations)) {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            result.push(fullPath);

            if (typeof value === 'object' && value !== null) {
                result.push(...this.flattenRelations(value, fullPath));
            }
        }

        return result;
    }
}
