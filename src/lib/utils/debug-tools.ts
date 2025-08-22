/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';

export interface DebugEvent {
    id: string;
    timestamp: Date;
    type: DebugEventType;
    context: string;
    data: any;
    metadata: DebugMetadata;
}

export type DebugEventType = 
    | 'request_start'
    | 'request_end'
    | 'query_start'
    | 'query_end'
    | 'hook_execution'
    | 'validation_error'
    | 'transform_start'
    | 'transform_end'
    | 'cache_hit'
    | 'cache_miss'
    | 'error'
    | 'warning';

export interface DebugMetadata {
    userId?: string;
    sessionId?: string;
    traceId?: string;
    source: string;
    level: DebugLevel;
    tags: string[];
}

export type DebugLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface DebugSession {
    id: string;
    startTime: Date;
    endTime?: Date;
    events: DebugEvent[];
    summary: SessionSummary;
}

export interface SessionSummary {
    totalRequests: number;
    totalQueries: number;
    averageResponseTime: number;
    errors: number;
    warnings: number;
    performance: PerformanceMetrics;
}

export interface PerformanceMetrics {
    slowQueries: number;
    cacheMisses: number;
    transformTime: number;
    validationTime: number;
}

export interface DebugQuery {
    query: string;
    parameters: any[];
    executionTime: number;
    affectedRows: number;
    stackTrace: string[];
}

export interface DebugInterceptorOptions {
    enableLogging?: boolean;
    enableTracing?: boolean;
    enablePerformanceMetrics?: boolean;
    maxEventHistory?: number;
    logLevel?: DebugLevel;
    includeQueryData?: boolean;
    includeRequestData?: boolean;
}

export interface DebugFilter {
    level?: DebugLevel;
    type?: DebugEventType;
    context?: string;
    tags?: string[];
    timeRange?: {
        start: Date;
        end: Date;
    };
}

/**
 * CRUD 디버깅 도구
 */
@Injectable()
export class CrudDebugger {
    private readonly logger = new Logger(CrudDebugger.name);
    private sessions: Map<string, DebugSession> = new Map();
    private currentSession?: DebugSession;
    private eventHandlers: Map<DebugEventType, DebugEventHandler[]> = new Map();
    private isEnabled = false;

    constructor(private readonly options: DebugInterceptorOptions = {}) {
        this.setupDefaultOptions();
        this.registerDefaultHandlers();
    }

    /**
     * 디버깅 시작
     */
    startDebugSession(sessionId?: string): DebugSession {
        const id = sessionId || this.generateSessionId();
        
        const session: DebugSession = {
            id,
            startTime: new Date(),
            events: [],
            summary: {
                totalRequests: 0,
                totalQueries: 0,
                averageResponseTime: 0,
                errors: 0,
                warnings: 0,
                performance: {
                    slowQueries: 0,
                    cacheMisses: 0,
                    transformTime: 0,
                    validationTime: 0
                }
            }
        };

        this.sessions.set(id, session);
        this.currentSession = session;
        this.isEnabled = true;

        this.logger.log(`디버그 세션 시작: ${id}`);
        
        return session;
    }

    /**
     * 디버깅 중지
     */
    stopDebugSession(sessionId?: string): DebugSession | null {
        const id = sessionId || this.currentSession?.id;
        if (!id) return null;

        const session = this.sessions.get(id);
        if (!session) return null;

        session.endTime = new Date();
        this.calculateSessionSummary(session);
        
        if (this.currentSession?.id === id) {
            this.currentSession = undefined;
            this.isEnabled = false;
        }

        this.logger.log(`디버그 세션 종료: ${id}`);
        
        return session;
    }

    /**
     * 디버그 이벤트 기록
     */
    logEvent(
        type: DebugEventType,
        context: string,
        data: any,
        metadata?: Partial<DebugMetadata>
    ): void {
        if (!this.isEnabled || !this.currentSession) return;

        const event: DebugEvent = {
            id: this.generateEventId(),
            timestamp: new Date(),
            type,
            context,
            data,
            metadata: {
                source: 'nestjs-crud',
                level: this.getDefaultLevel(type),
                tags: [],
                ...metadata
            }
        };

        this.addEventToSession(event);
        this.processEvent(event);
    }

    /**
     * 요청 시작 이벤트
     */
    logRequestStart(request: Request, context: ExecutionContext): void {
        const requestData = this.extractRequestData(request);
        
        this.logEvent('request_start', 'http', requestData, {
            traceId: this.getTraceId(request),
            sessionId: this.getSessionId(request),
            userId: this.getUserId(request)
        });
    }

    /**
     * 요청 종료 이벤트
     */
    logRequestEnd(request: Request, response: Response, duration: number): void {
        const responseData = {
            statusCode: response.statusCode,
            headers: response.getHeaders(),
            duration
        };

        this.logEvent('request_end', 'http', responseData, {
            traceId: this.getTraceId(request)
        });

        this.updateRequestMetrics(duration);
    }

    /**
     * 쿼리 실행 이벤트
     */
    logQuery(query: DebugQuery): void {
        this.logEvent('query_start', 'database', {
            query: query.query,
            parameters: this.options.includeQueryData ? query.parameters : '[hidden]',
            executionTime: query.executionTime,
            affectedRows: query.affectedRows
        });

        this.updateQueryMetrics(query);
    }

    /**
     * 훅 실행 이벤트
     */
    logHookExecution(hookName: string, data: any, duration: number): void {
        this.logEvent('hook_execution', 'lifecycle', {
            hookName,
            data: this.options.includeRequestData ? data : '[hidden]',
            duration
        });
    }

    /**
     * 유효성 검사 오류 이벤트
     */
    logValidationError(errors: any[], context: string): void {
        this.logEvent('validation_error', context, {
            errors,
            count: errors.length
        }, {
            level: 'error'
        });

        this.updateErrorMetrics();
    }

    /**
     * 변환 시작/종료 이벤트
     */
    logTransformStart(transformer: string, data: any): void {
        this.logEvent('transform_start', 'serialization', {
            transformer,
            dataType: typeof data,
            size: this.estimateDataSize(data)
        });
    }

    logTransformEnd(transformer: string, duration: number): void {
        this.logEvent('transform_end', 'serialization', {
            transformer,
            duration
        });

        this.updateTransformMetrics(duration);
    }

    /**
     * 캐시 이벤트
     */
    logCacheHit(key: string, layer: string): void {
        this.logEvent('cache_hit', 'cache', {
            key,
            layer
        });
    }

    logCacheMiss(key: string, layer: string): void {
        this.logEvent('cache_miss', 'cache', {
            key,
            layer
        });

        this.updateCacheMissMetrics();
    }

    /**
     * 오류 이벤트
     */
    logError(error: Error, context: string, additionalData?: any): void {
        this.logEvent('error', context, {
            message: error.message,
            stack: error.stack,
            name: error.name,
            additionalData
        }, {
            level: 'error'
        });

        this.updateErrorMetrics();
    }

    /**
     * 경고 이벤트
     */
    logWarning(message: string, context: string, data?: any): void {
        this.logEvent('warning', context, {
            message,
            data
        }, {
            level: 'warn'
        });

        this.updateWarningMetrics();
    }

    /**
     * 이벤트 핸들러 등록
     */
    registerEventHandler(type: DebugEventType, handler: DebugEventHandler): void {
        if (!this.eventHandlers.has(type)) {
            this.eventHandlers.set(type, []);
        }
        this.eventHandlers.get(type)!.push(handler);
    }

    /**
     * 이벤트 필터링
     */
    getEvents(filter?: DebugFilter): DebugEvent[] {
        if (!this.currentSession) return [];

        let events = this.currentSession.events;

        if (filter) {
            events = events.filter(event => {
                if (filter.level && event.metadata.level !== filter.level) return false;
                if (filter.type && event.type !== filter.type) return false;
                if (filter.context && event.context !== filter.context) return false;
                if (filter.tags && !filter.tags.some(tag => event.metadata.tags.includes(tag))) return false;
                if (filter.timeRange) {
                    if (event.timestamp < filter.timeRange.start || event.timestamp > filter.timeRange.end) {
                        return false;
                    }
                }
                return true;
            });
        }

        return events;
    }

    /**
     * 디버그 리포트 생성
     */
    generateReport(sessionId?: string): DebugReport {
        const session = sessionId ? 
            this.sessions.get(sessionId) : 
            this.currentSession;

        if (!session) {
            throw new Error('No debug session found');
        }

        return {
            sessionId: session.id,
            duration: session.endTime ? 
                session.endTime.getTime() - session.startTime.getTime() : 
                Date.now() - session.startTime.getTime(),
            summary: session.summary,
            events: session.events,
            analysis: this.analyzeSession(session),
            recommendations: this.generateRecommendations(session)
        };
    }

    /**
     * 실시간 모니터링 시작
     */
    startRealTimeMonitoring(callback: (event: DebugEvent) => void): void {
        this.registerEventHandler('request_start', callback);
        this.registerEventHandler('request_end', callback);
        this.registerEventHandler('query_start', callback);
        this.registerEventHandler('query_end', callback);
        this.registerEventHandler('error', callback);
    }

    /**
     * 성능 프로파일링
     */
    profilePerformance(): PerformanceProfile {
        if (!this.currentSession) return this.getEmptyProfile();

        const events = this.currentSession.events;
        const requestEvents = events.filter(e => e.type === 'request_end');
        const queryEvents = events.filter(e => e.type === 'query_start');

        return {
            requestCount: requestEvents.length,
            averageResponseTime: this.calculateAverageResponseTime(requestEvents),
            slowRequests: requestEvents.filter(e => e.data.duration > 1000).length,
            queryCount: queryEvents.length,
            slowQueries: queryEvents.filter(e => e.data.executionTime > 100).length,
            errorRate: this.currentSession.summary.errors / Math.max(requestEvents.length, 1) * 100,
            cacheHitRate: this.calculateCacheHitRate(events)
        };
    }

    // 내부 메서드들

    private setupDefaultOptions(): void {
        this.options = {
            enableLogging: true,
            enableTracing: true,
            enablePerformanceMetrics: true,
            maxEventHistory: 10000,
            logLevel: 'debug',
            includeQueryData: false,
            includeRequestData: false,
            ...this.options
        };
    }

    private registerDefaultHandlers(): void {
        // 콘솔 로거
        this.registerEventHandler('error', (event) => {
            this.logger.error(`[${event.context}] ${JSON.stringify(event.data)}`);
        });

        this.registerEventHandler('warning', (event) => {
            this.logger.warn(`[${event.context}] ${JSON.stringify(event.data)}`);
        });

        // 성능 경고
        this.registerEventHandler('query_start', (event) => {
            if (event.data.executionTime > 1000) {
                this.logger.warn(`느린 쿼리 감지: ${event.data.executionTime}ms`);
            }
        });
    }

    private addEventToSession(event: DebugEvent): void {
        if (!this.currentSession) return;

        this.currentSession.events.push(event);

        // 이벤트 히스토리 제한
        if (this.currentSession.events.length > (this.options.maxEventHistory || 10000)) {
            this.currentSession.events = this.currentSession.events.slice(-this.options.maxEventHistory!);
        }
    }

    private processEvent(event: DebugEvent): void {
        const handlers = this.eventHandlers.get(event.type) || [];
        handlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                this.logger.error(`이벤트 핸들러 실행 실패: ${error.message}`);
            }
        });
    }

    private calculateSessionSummary(session: DebugSession): void {
        const events = session.events;
        const requestEvents = events.filter(e => e.type === 'request_end');
        const queryEvents = events.filter(e => e.type === 'query_start');
        const errorEvents = events.filter(e => e.type === 'error');
        const warningEvents = events.filter(e => e.type === 'warning');

        session.summary = {
            totalRequests: requestEvents.length,
            totalQueries: queryEvents.length,
            averageResponseTime: this.calculateAverageResponseTime(requestEvents),
            errors: errorEvents.length,
            warnings: warningEvents.length,
            performance: {
                slowQueries: queryEvents.filter(e => e.data.executionTime > 100).length,
                cacheMisses: events.filter(e => e.type === 'cache_miss').length,
                transformTime: this.calculateTotalTransformTime(events),
                validationTime: this.calculateTotalValidationTime(events)
            }
        };
    }

    private calculateAverageResponseTime(requestEvents: DebugEvent[]): number {
        if (requestEvents.length === 0) return 0;
        
        const totalTime = requestEvents.reduce((sum, event) => sum + event.data.duration, 0);
        return Math.round(totalTime / requestEvents.length);
    }

    private calculateTotalTransformTime(events: DebugEvent[]): number {
        return events
            .filter(e => e.type === 'transform_end')
            .reduce((sum, event) => sum + event.data.duration, 0);
    }

    private calculateTotalValidationTime(events: DebugEvent[]): number {
        // 유효성 검사 시간 계산 로직
        return 0;
    }

    private calculateCacheHitRate(events: DebugEvent[]): number {
        const cacheHits = events.filter(e => e.type === 'cache_hit').length;
        const cacheMisses = events.filter(e => e.type === 'cache_miss').length;
        const total = cacheHits + cacheMisses;
        
        return total > 0 ? (cacheHits / total) * 100 : 0;
    }

    private analyzeSession(session: DebugSession): SessionAnalysis {
        return {
            performanceIssues: this.findPerformanceIssues(session),
            errorPatterns: this.findErrorPatterns(session),
            recommendations: this.generateRecommendations(session)
        };
    }

    private findPerformanceIssues(session: DebugSession): PerformanceIssue[] {
        const issues: PerformanceIssue[] = [];
        
        // 느린 쿼리 감지
        const slowQueries = session.events.filter(e => 
            e.type === 'query_start' && e.data.executionTime > 1000
        );
        
        if (slowQueries.length > 0) {
            issues.push({
                type: 'slow_queries',
                severity: 'high',
                count: slowQueries.length,
                description: `${slowQueries.length}개의 느린 쿼리가 감지되었습니다`,
                suggestions: ['인덱스 추가 검토', '쿼리 최적화', '캐싱 적용']
            });
        }

        return issues;
    }

    private findErrorPatterns(session: DebugSession): ErrorPattern[] {
        const patterns: ErrorPattern[] = [];
        const errorEvents = session.events.filter(e => e.type === 'error');
        
        // 오류 패턴 분석
        const errorGroups = this.groupErrorsByType(errorEvents);
        
        Object.entries(errorGroups).forEach(([errorType, errors]) => {
            if (errors.length > 1) {
                patterns.push({
                    type: errorType,
                    frequency: errors.length,
                    description: `${errorType} 오류가 ${errors.length}회 반복됨`,
                    firstOccurrence: errors[0].timestamp,
                    lastOccurrence: errors[errors.length - 1].timestamp
                });
            }
        });

        return patterns;
    }

    private groupErrorsByType(errorEvents: DebugEvent[]): Record<string, DebugEvent[]> {
        return errorEvents.reduce((groups, event) => {
            const errorType = event.data.name || 'Unknown';
            if (!groups[errorType]) {
                groups[errorType] = [];
            }
            groups[errorType].push(event);
            return groups;
        }, {} as Record<string, DebugEvent[]>);
    }

    private generateRecommendations(session: DebugSession): string[] {
        const recommendations: string[] = [];
        
        if (session.summary.performance.slowQueries > 0) {
            recommendations.push('느린 쿼리 최적화를 위해 인덱스 추가를 검토하세요');
        }
        
        if (session.summary.errors > session.summary.totalRequests * 0.1) {
            recommendations.push('오류율이 높습니다. 오류 처리 로직을 개선하세요');
        }
        
        const cacheHitRate = this.calculateCacheHitRate(session.events);
        if (cacheHitRate < 50) {
            recommendations.push('캐시 히트율이 낮습니다. 캐시 전략을 재검토하세요');
        }
        
        return recommendations;
    }

    private updateRequestMetrics(duration: number): void {
        if (!this.currentSession) return;
        this.currentSession.summary.totalRequests++;
    }

    private updateQueryMetrics(query: DebugQuery): void {
        if (!this.currentSession) return;
        this.currentSession.summary.totalQueries++;
        
        if (query.executionTime > 100) {
            this.currentSession.summary.performance.slowQueries++;
        }
    }

    private updateErrorMetrics(): void {
        if (!this.currentSession) return;
        this.currentSession.summary.errors++;
    }

    private updateWarningMetrics(): void {
        if (!this.currentSession) return;
        this.currentSession.summary.warnings++;
    }

    private updateTransformMetrics(duration: number): void {
        if (!this.currentSession) return;
        this.currentSession.summary.performance.transformTime += duration;
    }

    private updateCacheMissMetrics(): void {
        if (!this.currentSession) return;
        this.currentSession.summary.performance.cacheMisses++;
    }

    private getEmptyProfile(): PerformanceProfile {
        return {
            requestCount: 0,
            averageResponseTime: 0,
            slowRequests: 0,
            queryCount: 0,
            slowQueries: 0,
            errorRate: 0,
            cacheHitRate: 0
        };
    }

    // 유틸리티 메서드들
    private generateSessionId(): string {
        return `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateEventId(): string {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getDefaultLevel(type: DebugEventType): DebugLevel {
        switch (type) {
            case 'error': return 'error';
            case 'warning': return 'warn';
            case 'validation_error': return 'error';
            default: return 'debug';
        }
    }

    private extractRequestData(request: Request): any {
        return {
            method: request.method,
            url: request.url,
            headers: this.options.includeRequestData ? request.headers : '[hidden]',
            query: request.query,
            params: request.params,
            ip: request.ip,
            userAgent: request.get('User-Agent')
        };
    }

    private getTraceId(request: Request): string {
        return (request as any).traceId || this.generateEventId();
    }

    private getSessionId(request: Request): string {
        return (request as any).sessionId || 'unknown';
    }

    private getUserId(request: Request): string {
        return (request as any).user?.id || 'anonymous';
    }

    private estimateDataSize(data: any): number {
        try {
            return JSON.stringify(data).length;
        } catch {
            return 0;
        }
    }
}

// 타입 정의들
export type DebugEventHandler = (event: DebugEvent) => void;

export interface DebugReport {
    sessionId: string;
    duration: number;
    summary: SessionSummary;
    events: DebugEvent[];
    analysis: SessionAnalysis;
    recommendations: string[];
}

export interface SessionAnalysis {
    performanceIssues: PerformanceIssue[];
    errorPatterns: ErrorPattern[];
    recommendations: string[];
}

export interface PerformanceIssue {
    type: string;
    severity: 'low' | 'medium' | 'high';
    count: number;
    description: string;
    suggestions: string[];
}

export interface ErrorPattern {
    type: string;
    frequency: number;
    description: string;
    firstOccurrence: Date;
    lastOccurrence: Date;
}

export interface PerformanceProfile {
    requestCount: number;
    averageResponseTime: number;
    slowRequests: number;
    queryCount: number;
    slowQueries: number;
    errorRate: number;
    cacheHitRate: number;
}

/**
 * 디버그 인터셉터
 */
export function DebugInterceptor(options: DebugInterceptorOptions = {}) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const debugInstance = this.debugger as CrudDebugger;
            if (!debugInstance) return method.apply(this, args);
            
            const startTime = Date.now();
            
            try {
                debugInstance.logEvent('request_start', `${target.constructor.name}.${propertyName}`, {
                    arguments: options.includeRequestData ? args : '[hidden]'
                });
                
                const result = await method.apply(this, args);
                const duration = Date.now() - startTime;
                
                debugInstance.logEvent('request_end', `${target.constructor.name}.${propertyName}`, {
                    duration,
                    success: true
                });
                
                return result;
            } catch (error) {
                const duration = Date.now() - startTime;
                
                debugInstance.logError(error, `${target.constructor.name}.${propertyName}`, {
                    duration,
                    arguments: options.includeRequestData ? args : '[hidden]'
                });
                
                throw error;
            }
        };
    };
}