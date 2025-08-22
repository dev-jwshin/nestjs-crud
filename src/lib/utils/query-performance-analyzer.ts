/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { Connection, QueryRunner, SelectQueryBuilder } from 'typeorm';

export interface QueryPerformanceMetrics {
    query: string;
    executionTime: number;
    rowsAffected: number;
    indexesUsed: string[];
    fullTableScans: boolean;
    warnings: PerformanceWarning[];
    recommendations: PerformanceRecommendation[];
    complexity: QueryComplexity;
    cost: QueryCost;
}

export interface PerformanceWarning {
    type: 'slow_query' | 'full_table_scan' | 'missing_index' | 'inefficient_join' | 'large_result_set';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    suggestion: string;
}

export interface PerformanceRecommendation {
    type: 'add_index' | 'optimize_query' | 'pagination' | 'limit_columns' | 'cache_result';
    priority: number;
    impact: 'low' | 'medium' | 'high';
    description: string;
    implementation: string;
    estimatedImprovement: number;
}

export interface QueryComplexity {
    score: number;
    level: 'simple' | 'moderate' | 'complex' | 'very_complex';
    factors: ComplexityFactor[];
}

export interface ComplexityFactor {
    type: string;
    value: number;
    impact: number;
    description: string;
}

export interface QueryCost {
    estimated: number;
    actual?: number;
    breakdown: CostBreakdown;
}

export interface CostBreakdown {
    tableScans: number;
    indexLookups: number;
    joins: number;
    sorting: number;
    grouping: number;
    filtering: number;
}

export interface PerformanceAnalysisOptions {
    enableExplain?: boolean;
    enableProfiling?: boolean;
    slowQueryThreshold?: number;
    sampleSize?: number;
    includeRecommendations?: boolean;
    trackHistory?: boolean;
}

export interface QueryPattern {
    pattern: string;
    count: number;
    avgExecutionTime: number;
    maxExecutionTime: number;
    minExecutionTime: number;
    firstSeen: Date;
    lastSeen: Date;
}

export interface PerformanceReport {
    generatedAt: Date;
    totalQueries: number;
    slowQueries: number;
    averageExecutionTime: number;
    topSlowQueries: QueryPerformanceMetrics[];
    patterns: QueryPattern[];
    recommendations: PerformanceRecommendation[];
    summary: PerformanceSummary;
}

export interface PerformanceSummary {
    healthScore: number;
    criticalIssues: number;
    improvementOpportunities: number;
    estimatedSpeedup: number;
}

/**
 * 쿼리 성능 분석기
 */
@Injectable()
export class QueryPerformanceAnalyzer {
    private readonly logger = new Logger(QueryPerformanceAnalyzer.name);
    private queryHistory: QueryPerformanceMetrics[] = [];
    private patterns: Map<string, QueryPattern> = new Map();
    private isProfilingEnabled = false;

    constructor(private readonly connection: Connection) {}

    /**
     * 쿼리 성능 분석 시작
     */
    async startProfiling(options: PerformanceAnalysisOptions = {}): Promise<void> {
        this.isProfilingEnabled = true;
        
        const defaultOptions: PerformanceAnalysisOptions = {
            enableExplain: true,
            enableProfiling: true,
            slowQueryThreshold: 1000, // 1초
            sampleSize: 1000,
            includeRecommendations: true,
            trackHistory: true,
            ...options
        };

        this.logger.log('쿼리 성능 분석 시작');
        
        // 데이터베이스별 프로파일링 설정
        await this.setupDatabaseProfiling(defaultOptions);
    }

    /**
     * 쿼리 성능 분석 중지
     */
    async stopProfiling(): Promise<void> {
        this.isProfilingEnabled = false;
        await this.disableDatabaseProfiling();
        this.logger.log('쿼리 성능 분석 중지');
    }

    /**
     * 개별 쿼리 분석
     */
    async analyzeQuery(
        query: string,
        parameters: any[] = [],
        options: PerformanceAnalysisOptions = {}
    ): Promise<QueryPerformanceMetrics> {
        const startTime = process.hrtime.bigint();
        
        try {
            const queryRunner = this.connection.createQueryRunner();
            
            try {
                // 쿼리 실행 계획 분석
                const explainResult = options.enableExplain ? 
                    await this.getQueryExplain(queryRunner, query, parameters) : null;
                
                // 쿼리 실행
                const result = await queryRunner.query(query, parameters);
                const endTime = process.hrtime.bigint();
                const executionTime = Number(endTime - startTime) / 1000000; // ms로 변환
                
                // 성능 메트릭 생성
                const metrics: QueryPerformanceMetrics = {
                    query: this.normalizeQuery(query),
                    executionTime,
                    rowsAffected: Array.isArray(result) ? result.length : 1,
                    indexesUsed: this.extractIndexesUsed(explainResult),
                    fullTableScans: this.detectFullTableScans(explainResult),
                    warnings: this.generateWarnings(query, executionTime, explainResult),
                    recommendations: [],
                    complexity: this.analyzeComplexity(query),
                    cost: this.estimateCost(query, explainResult)
                };

                // 권장사항 생성
                if (options.includeRecommendations) {
                    metrics.recommendations = await this.generateRecommendations(metrics, explainResult);
                }

                // 히스토리 추적
                if (options.trackHistory) {
                    this.trackQueryHistory(metrics);
                    this.updatePatterns(metrics);
                }

                return metrics;
                
            } finally {
                await queryRunner.release();
            }
            
        } catch (error) {
            this.logger.error(`쿼리 분석 실패: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * QueryBuilder 분석
     */
    async analyzeQueryBuilder<T>(
        queryBuilder: SelectQueryBuilder<T>,
        options: PerformanceAnalysisOptions = {}
    ): Promise<QueryPerformanceMetrics> {
        const [query, parameters] = queryBuilder.getQueryAndParameters();
        return this.analyzeQuery(query, parameters, options);
    }

    /**
     * 성능 리포트 생성
     */
    generatePerformanceReport(): PerformanceReport {
        const now = new Date();
        const slowThreshold = 1000; // 1초
        const slowQueries = this.queryHistory.filter(q => q.executionTime > slowThreshold);
        
        const totalExecutionTime = this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0);
        const avgExecutionTime = this.queryHistory.length > 0 ? 
            totalExecutionTime / this.queryHistory.length : 0;

        // 가장 느린 쿼리들 (상위 10개)
        const topSlowQueries = [...this.queryHistory]
            .sort((a, b) => b.executionTime - a.executionTime)
            .slice(0, 10);

        // 모든 권장사항 수집
        const allRecommendations = this.queryHistory
            .flatMap(q => q.recommendations)
            .sort((a, b) => b.priority - a.priority);

        // 중복 제거된 권장사항
        const uniqueRecommendations = this.deduplicateRecommendations(allRecommendations);

        // 건강 점수 계산
        const healthScore = this.calculateHealthScore();

        // 성능 요약
        const summary: PerformanceSummary = {
            healthScore,
            criticalIssues: this.queryHistory.filter(q => 
                q.warnings.some(w => w.severity === 'critical')).length,
            improvementOpportunities: uniqueRecommendations.length,
            estimatedSpeedup: this.calculateEstimatedSpeedup(uniqueRecommendations)
        };

        return {
            generatedAt: now,
            totalQueries: this.queryHistory.length,
            slowQueries: slowQueries.length,
            averageExecutionTime: avgExecutionTime,
            topSlowQueries,
            patterns: Array.from(this.patterns.values()),
            recommendations: uniqueRecommendations.slice(0, 10), // 상위 10개
            summary
        };
    }

    /**
     * 실시간 모니터링 시작
     */
    startRealTimeMonitoring(callback: (metrics: QueryPerformanceMetrics) => void): void {
        // 실시간 모니터링 로직
        this.logger.log('실시간 성능 모니터링 시작');
    }

    /**
     * 쿼리 최적화 제안
     */
    async suggestOptimizations(query: string): Promise<string[]> {
        const metrics = await this.analyzeQuery(query);
        return metrics.recommendations.map(r => r.description);
    }

    /**
     * 인덱스 사용률 분석
     */
    analyzeIndexUsage(): Promise<IndexUsageReport> {
        return this.connection.query(`
            SELECT 
                schemaname,
                tablename,
                indexname,
                idx_tup_read,
                idx_tup_fetch,
                idx_scan
            FROM pg_stat_user_indexes
            ORDER BY idx_scan DESC
        `).then(results => ({
            totalIndexes: results.length,
            unusedIndexes: results.filter((r: any) => r.idx_scan === 0),
            mostUsedIndexes: results.slice(0, 10),
            recommendations: this.generateIndexRecommendations(results)
        }));
    }

    /**
     * 데이터베이스별 프로파일링 설정
     */
    private async setupDatabaseProfiling(options: PerformanceAnalysisOptions): Promise<void> {
        const dbType = this.connection.options.type;
        
        switch (dbType) {
            case 'mysql':
                await this.setupMySQLProfiling(options);
                break;
            case 'postgres':
                await this.setupPostgresProfiling(options);
                break;
            case 'sqlite':
                await this.setupSQLiteProfiling(options);
                break;
        }
    }

    /**
     * MySQL 프로파일링 설정
     */
    private async setupMySQLProfiling(options: PerformanceAnalysisOptions): Promise<void> {
        await this.connection.query('SET profiling = 1');
        await this.connection.query(`SET long_query_time = ${options.slowQueryThreshold! / 1000}`);
        await this.connection.query('SET log_queries_not_using_indexes = ON');
    }

    /**
     * PostgreSQL 프로파일링 설정
     */
    private async setupPostgresProfiling(options: PerformanceAnalysisOptions): Promise<void> {
        await this.connection.query(`SET log_min_duration_statement = ${options.slowQueryThreshold}`);
        await this.connection.query('SET log_statement_stats = ON');
        await this.connection.query('SET track_activities = ON');
    }

    /**
     * SQLite 프로파일링 설정
     */
    private async setupSQLiteProfiling(options: PerformanceAnalysisOptions): Promise<void> {
        // SQLite는 제한적인 프로파일링 지원
        this.logger.warn('SQLite has limited profiling capabilities');
    }

    /**
     * 프로파일링 비활성화
     */
    private async disableDatabaseProfiling(): Promise<void> {
        const dbType = this.connection.options.type;
        
        try {
            switch (dbType) {
                case 'mysql':
                    await this.connection.query('SET profiling = 0');
                    break;
                case 'postgres':
                    await this.connection.query('SET log_min_duration_statement = -1');
                    break;
            }
        } catch (error) {
            this.logger.warn(`프로파일링 비활성화 실패: ${error.message}`);
        }
    }

    /**
     * 쿼리 실행 계획 조회
     */
    private async getQueryExplain(
        queryRunner: QueryRunner,
        query: string,
        parameters: any[]
    ): Promise<any> {
        const dbType = this.connection.options.type;
        
        try {
            switch (dbType) {
                case 'mysql':
                    return await queryRunner.query(`EXPLAIN FORMAT=JSON ${query}`, parameters);
                case 'postgres':
                    return await queryRunner.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, parameters);
                case 'sqlite':
                    return await queryRunner.query(`EXPLAIN QUERY PLAN ${query}`, parameters);
                default:
                    return null;
            }
        } catch (error) {
            this.logger.warn(`EXPLAIN 실행 실패: ${error.message}`);
            return null;
        }
    }

    /**
     * 사용된 인덱스 추출
     */
    private extractIndexesUsed(explainResult: any): string[] {
        if (!explainResult) return [];
        
        const indexes: string[] = [];
        
        // 데이터베이스별 인덱스 정보 추출 로직
        if (Array.isArray(explainResult)) {
            explainResult.forEach(row => {
                if (row.key && row.key !== 'PRIMARY') {
                    indexes.push(row.key);
                }
            });
        }
        
        return indexes;
    }

    /**
     * 풀 테이블 스캔 감지
     */
    private detectFullTableScans(explainResult: any): boolean {
        if (!explainResult) return false;
        
        // EXPLAIN 결과에서 풀 테이블 스캔 패턴 찾기
        const resultStr = JSON.stringify(explainResult).toLowerCase();
        return resultStr.includes('full table scan') || 
               resultStr.includes('table scan') ||
               resultStr.includes('seq scan');
    }

    /**
     * 경고 생성
     */
    private generateWarnings(
        query: string,
        executionTime: number,
        explainResult: any
    ): PerformanceWarning[] {
        const warnings: PerformanceWarning[] = [];
        
        // 느린 쿼리 경고
        if (executionTime > 5000) {
            warnings.push({
                type: 'slow_query',
                severity: 'critical',
                message: `쿼리 실행 시간이 ${executionTime}ms로 매우 느립니다`,
                suggestion: '쿼리 최적화 또는 인덱스 추가를 고려하세요'
            });
        } else if (executionTime > 1000) {
            warnings.push({
                type: 'slow_query',
                severity: 'medium',
                message: `쿼리 실행 시간이 ${executionTime}ms로 느립니다`,
                suggestion: '성능 개선을 검토해보세요'
            });
        }
        
        // 풀 테이블 스캔 경고
        if (this.detectFullTableScans(explainResult)) {
            warnings.push({
                type: 'full_table_scan',
                severity: 'high',
                message: '풀 테이블 스캔이 감지되었습니다',
                suggestion: '적절한 인덱스를 추가하세요'
            });
        }
        
        // SELECT * 사용 경고
        if (query.toLowerCase().includes('select *')) {
            warnings.push({
                type: 'inefficient_join',
                severity: 'low',
                message: 'SELECT * 사용이 감지되었습니다',
                suggestion: '필요한 컬럼만 명시적으로 선택하세요'
            });
        }
        
        return warnings;
    }

    /**
     * 권장사항 생성
     */
    private async generateRecommendations(
        metrics: QueryPerformanceMetrics,
        explainResult: any
    ): Promise<PerformanceRecommendation[]> {
        const recommendations: PerformanceRecommendation[] = [];
        
        // 인덱스 추가 권장
        if (metrics.fullTableScans || metrics.executionTime > 1000) {
            recommendations.push({
                type: 'add_index',
                priority: 9,
                impact: 'high',
                description: 'WHERE 절에 사용된 컬럼에 인덱스 추가',
                implementation: '적절한 컬럼에 인덱스를 생성하세요',
                estimatedImprovement: 70
            });
        }
        
        // 페이지네이션 권장
        if (metrics.rowsAffected > 1000) {
            recommendations.push({
                type: 'pagination',
                priority: 7,
                impact: 'medium',
                description: '대용량 결과에 페이지네이션 적용',
                implementation: 'LIMIT과 OFFSET을 사용하여 결과를 제한하세요',
                estimatedImprovement: 50
            });
        }
        
        // 쿼리 캐싱 권장
        if (metrics.complexity.level === 'complex' || metrics.complexity.level === 'very_complex') {
            recommendations.push({
                type: 'cache_result',
                priority: 6,
                impact: 'medium',
                description: '복잡한 쿼리 결과를 캐싱',
                implementation: 'Redis 또는 메모리 캐시를 사용하여 결과를 캐시하세요',
                estimatedImprovement: 80
            });
        }
        
        return recommendations.sort((a, b) => b.priority - a.priority);
    }

    /**
     * 쿼리 복잡도 분석
     */
    private analyzeComplexity(query: string): QueryComplexity {
        const factors: ComplexityFactor[] = [];
        let score = 0;
        
        const lowerQuery = query.toLowerCase();
        
        // JOIN 개수
        const joinCount = (lowerQuery.match(/\bjoin\b/g) || []).length;
        if (joinCount > 0) {
            const impact = joinCount * 2;
            factors.push({
                type: 'joins',
                value: joinCount,
                impact,
                description: `${joinCount}개의 JOIN 사용`
            });
            score += impact;
        }
        
        // 서브쿼리 개수
        const subqueryCount = (lowerQuery.match(/\bselect\b/g) || []).length - 1;
        if (subqueryCount > 0) {
            const impact = subqueryCount * 3;
            factors.push({
                type: 'subqueries',
                value: subqueryCount,
                impact,
                description: `${subqueryCount}개의 서브쿼리 사용`
            });
            score += impact;
        }
        
        // 집계 함수
        const aggregateCount = (lowerQuery.match(/\b(count|sum|avg|max|min|group_concat)\b/g) || []).length;
        if (aggregateCount > 0) {
            const impact = aggregateCount * 1.5;
            factors.push({
                type: 'aggregates',
                value: aggregateCount,
                impact,
                description: `${aggregateCount}개의 집계 함수 사용`
            });
            score += impact;
        }
        
        // WHERE 절 복잡도
        const whereConditions = (lowerQuery.match(/\b(and|or)\b/g) || []).length + 1;
        if (whereConditions > 3) {
            const impact = whereConditions * 0.5;
            factors.push({
                type: 'conditions',
                value: whereConditions,
                impact,
                description: `${whereConditions}개의 WHERE 조건`
            });
            score += impact;
        }
        
        // 복잡도 레벨 결정
        let level: QueryComplexity['level'];
        if (score <= 5) level = 'simple';
        else if (score <= 15) level = 'moderate';
        else if (score <= 30) level = 'complex';
        else level = 'very_complex';
        
        return { score, level, factors };
    }

    /**
     * 쿼리 비용 추정
     */
    private estimateCost(query: string, explainResult: any): QueryCost {
        const breakdown: CostBreakdown = {
            tableScans: 0,
            indexLookups: 0,
            joins: 0,
            sorting: 0,
            grouping: 0,
            filtering: 0
        };
        
        const lowerQuery = query.toLowerCase();
        
        // 기본 비용 계산
        breakdown.joins = (lowerQuery.match(/\bjoin\b/g) || []).length * 10;
        breakdown.sorting = (lowerQuery.match(/\border\s+by\b/g) || []).length * 5;
        breakdown.grouping = (lowerQuery.match(/\bgroup\s+by\b/g) || []).length * 8;
        breakdown.filtering = (lowerQuery.match(/\bwhere\b/g) || []).length * 2;
        
        const estimated = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);
        
        return {
            estimated,
            breakdown
        };
    }

    /**
     * 쿼리 정규화
     */
    private normalizeQuery(query: string): string {
        return query
            .replace(/\s+/g, ' ')
            .replace(/\b\d+\b/g, '?')
            .replace(/'[^']*'/g, '?')
            .trim();
    }

    /**
     * 쿼리 히스토리 추적
     */
    private trackQueryHistory(metrics: QueryPerformanceMetrics): void {
        this.queryHistory.push(metrics);
        
        // 메모리 관리: 최대 1000개까지만 유지
        if (this.queryHistory.length > 1000) {
            this.queryHistory = this.queryHistory.slice(-1000);
        }
    }

    /**
     * 쿼리 패턴 업데이트
     */
    private updatePatterns(metrics: QueryPerformanceMetrics): void {
        const pattern = metrics.query;
        const existing = this.patterns.get(pattern);
        
        if (existing) {
            existing.count++;
            existing.avgExecutionTime = (existing.avgExecutionTime * (existing.count - 1) + metrics.executionTime) / existing.count;
            existing.maxExecutionTime = Math.max(existing.maxExecutionTime, metrics.executionTime);
            existing.minExecutionTime = Math.min(existing.minExecutionTime, metrics.executionTime);
            existing.lastSeen = new Date();
        } else {
            this.patterns.set(pattern, {
                pattern,
                count: 1,
                avgExecutionTime: metrics.executionTime,
                maxExecutionTime: metrics.executionTime,
                minExecutionTime: metrics.executionTime,
                firstSeen: new Date(),
                lastSeen: new Date()
            });
        }
    }

    /**
     * 권장사항 중복 제거
     */
    private deduplicateRecommendations(recommendations: PerformanceRecommendation[]): PerformanceRecommendation[] {
        const seen = new Set<string>();
        return recommendations.filter(rec => {
            const key = `${rec.type}-${rec.description}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * 건강 점수 계산
     */
    private calculateHealthScore(): number {
        if (this.queryHistory.length === 0) return 100;
        
        const slowQueries = this.queryHistory.filter(q => q.executionTime > 1000).length;
        const criticalIssues = this.queryHistory.filter(q => 
            q.warnings.some(w => w.severity === 'critical')).length;
        
        const slowQueryRatio = slowQueries / this.queryHistory.length;
        const criticalIssueRatio = criticalIssues / this.queryHistory.length;
        
        const score = Math.max(0, 100 - (slowQueryRatio * 50) - (criticalIssueRatio * 30));
        return Math.round(score);
    }

    /**
     * 예상 성능 개선 계산
     */
    private calculateEstimatedSpeedup(recommendations: PerformanceRecommendation[]): number {
        return recommendations.reduce((total, rec) => total + rec.estimatedImprovement, 0) / recommendations.length || 0;
    }

    /**
     * 인덱스 권장사항 생성
     */
    private generateIndexRecommendations(indexUsageResults: any[]): string[] {
        const recommendations: string[] = [];
        
        // 사용되지 않는 인덱스
        const unusedIndexes = indexUsageResults.filter((r: any) => r.idx_scan === 0);
        if (unusedIndexes.length > 0) {
            recommendations.push(`${unusedIndexes.length}개의 사용되지 않는 인덱스 제거 고려`);
        }
        
        return recommendations;
    }
}

/**
 * 인덱스 사용률 리포트 인터페이스
 */
interface IndexUsageReport {
    totalIndexes: number;
    unusedIndexes: any[];
    mostUsedIndexes: any[];
    recommendations: string[];
}

/**
 * 쿼리 성능 분석 데코레이터
 */
export function AnalyzePerformance(options: PerformanceAnalysisOptions = {}) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const analyzer = new QueryPerformanceAnalyzer(this.connection || this.repository?.manager?.connection);
            
            if (analyzer) {
                // 메서드 실행 전후로 성능 분석
                const startTime = process.hrtime.bigint();
                const result = await method.apply(this, args);
                const endTime = process.hrtime.bigint();
                const executionTime = Number(endTime - startTime) / 1000000;
                
                // 로깅
                console.log(`[Performance] ${target.constructor.name}.${propertyName}: ${executionTime}ms`);
                
                return result;
            } else {
                return method.apply(this, args);
            }
        };
    };
}