/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { Response } from 'express';

/**
 * 진행 상황 추적 클래스
 */
@Injectable()
export class ProgressTracker {
    private static activeJobs = new Map<string, ProgressJob>();
    private static jobHistory = new Map<string, CompletedJob>();

    /**
     * 새로운 진행 상황 추적 작업 생성
     */
    static createJob(
        jobId: string,
        totalSteps: number,
        metadata?: Record<string, any>
    ): ProgressJob {
        const job: ProgressJob = {
            id: jobId,
            status: 'pending',
            currentStep: 0,
            totalSteps,
            percentage: 0,
            startTime: Date.now(),
            estimatedCompletion: null,
            metadata: metadata || {},
            steps: [],
            errors: [],
            warnings: [],
        };

        this.activeJobs.set(jobId, job);
        return job;
    }

    /**
     * 작업 진행 상황 업데이트
     */
    static updateProgress(
        jobId: string,
        stepInfo: StepInfo,
        increment: boolean = true
    ): ProgressJob | null {
        const job = this.activeJobs.get(jobId);
        if (!job) return null;

        if (increment) {
            job.currentStep++;
        }

        job.percentage = Math.round((job.currentStep / job.totalSteps) * 100);
        job.status = job.currentStep >= job.totalSteps ? 'completed' : 'in_progress';
        
        // 예상 완료 시간 계산
        if (job.currentStep > 0 && job.status === 'in_progress') {
            const elapsedTime = Date.now() - job.startTime;
            const avgTimePerStep = elapsedTime / job.currentStep;
            const remainingSteps = job.totalSteps - job.currentStep;
            job.estimatedCompletion = Date.now() + (avgTimePerStep * remainingSteps);
        }

        // 단계 정보 추가
        job.steps.push({
            ...stepInfo,
            timestamp: Date.now(),
            stepNumber: job.currentStep,
        });

        // 작업 완료 시 히스토리로 이동
        if (job.status === 'completed') {
            this.moveToHistory(jobId, job);
        }

        return job;
    }

    /**
     * 작업에 오류 추가
     */
    static addError(jobId: string, error: JobError): ProgressJob | null {
        const job = this.activeJobs.get(jobId);
        if (!job) return null;

        job.errors.push({
            ...error,
            timestamp: Date.now(),
        });

        if (error.fatal) {
            job.status = 'failed';
            this.moveToHistory(jobId, job);
        }

        return job;
    }

    /**
     * 작업에 경고 추가
     */
    static addWarning(jobId: string, warning: JobWarning): ProgressJob | null {
        const job = this.activeJobs.get(jobId);
        if (!job) return null;

        job.warnings.push({
            ...warning,
            timestamp: Date.now(),
        });

        return job;
    }

    /**
     * 작업 상태 조회
     */
    static getJob(jobId: string): ProgressJob | CompletedJob | null {
        return this.activeJobs.get(jobId) || this.jobHistory.get(jobId) || null;
    }

    /**
     * 모든 활성 작업 조회
     */
    static getActiveJobs(): ProgressJob[] {
        return Array.from(this.activeJobs.values());
    }

    /**
     * 작업 히스토리 조회
     */
    static getJobHistory(limit?: number): CompletedJob[] {
        const history = Array.from(this.jobHistory.values());
        return limit ? history.slice(-limit) : history;
    }

    /**
     * 실시간 진행 상황 스트리밍 (Server-Sent Events)
     */
    static streamProgress(jobId: string, response: Response): void {
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('Access-Control-Allow-Origin', '*');

        const sendUpdate = () => {
            const job = this.getJob(jobId);
            if (job) {
                const data = JSON.stringify(job);
                response.write(`data: ${data}\n\n`);

                if (job.status === 'completed' || job.status === 'failed') {
                    response.end();
                    return;
                }
            }
        };

        // 초기 상태 전송
        sendUpdate();

        // 주기적 업데이트 (실제 환경에서는 이벤트 기반으로 개선)
        const interval = setInterval(() => {
            const job = this.getJob(jobId);
            if (!job || job.status === 'completed' || job.status === 'failed') {
                clearInterval(interval);
                response.end();
                return;
            }
            sendUpdate();
        }, 1000);

        // 클라이언트 연결 해제 시 정리
        response.on('close', () => {
            clearInterval(interval);
        });
    }

    /**
     * 배치 작업 진행 상황 추적
     */
    static createBatchJob<T>(
        data: T[],
        processor: (item: T, index: number) => Promise<any>,
        options?: BatchJobOptions
    ): BatchJobManager<T> {
        const jobId = options?.jobId || this.generateJobId();
        const batchSize = options?.batchSize || 10;
        
        return new BatchJobManager<T>(jobId, data, processor, batchSize, options);
    }

    /**
     * 대용량 파일 처리 진행 상황 추적
     */
    static createFileProcessingJob(
        fileName: string,
        fileSize: number,
        processor: FileProcessor
    ): FileProcessingJobManager {
        const jobId = this.generateJobId();
        return new FileProcessingJobManager(jobId, fileName, fileSize, processor);
    }

    /**
     * 작업 취소
     */
    static cancelJob(jobId: string): boolean {
        const job = this.activeJobs.get(jobId);
        if (!job) return false;

        job.status = 'cancelled';
        this.moveToHistory(jobId, job);
        return true;
    }

    /**
     * 만료된 작업 정리
     */
    static cleanup(maxAge: number = 24 * 60 * 60 * 1000): number { // 기본 24시간
        const now = Date.now();
        let cleanedCount = 0;

        // 활성 작업 중 오래된 것들 정리
        for (const [jobId, job] of this.activeJobs.entries()) {
            if (now - job.startTime > maxAge) {
                this.activeJobs.delete(jobId);
                cleanedCount++;
            }
        }

        // 히스토리 정리
        for (const [jobId, job] of this.jobHistory.entries()) {
            if (now - job.startTime > maxAge) {
                this.jobHistory.delete(jobId);
                cleanedCount++;
            }
        }

        return cleanedCount;
    }

    // Private helper methods

    private static generateJobId(): string {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private static moveToHistory(jobId: string, job: ProgressJob): void {
        const completedJob: CompletedJob = {
            ...job,
            endTime: Date.now(),
            duration: Date.now() - job.startTime,
        };

        this.jobHistory.set(jobId, completedJob);
        this.activeJobs.delete(jobId);
    }
}

/**
 * 배치 작업 관리자
 */
export class BatchJobManager<T> {
    private job: ProgressJob;
    private cancelled = false;

    constructor(
        private jobId: string,
        private data: T[],
        private processor: (item: T, index: number) => Promise<any>,
        private batchSize: number,
        private options?: BatchJobOptions
    ) {
        this.job = ProgressTracker.createJob(
            jobId,
            Math.ceil(data.length / batchSize),
            {
                totalItems: data.length,
                batchSize,
                type: 'batch',
            }
        );
    }

    /**
     * 배치 작업 실행
     */
    async execute(): Promise<any[]> {
        const results: any[] = [];
        const batches = this.chunkArray(this.data, this.batchSize);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            if (this.cancelled) break;

            const batch = batches[batchIndex];
            const batchStartTime = Date.now();

            try {
                const batchResults = await Promise.all(
                    batch.map((item, itemIndex) => 
                        this.processor(item, batchIndex * this.batchSize + itemIndex)
                    )
                );

                results.push(...batchResults);

                const batchProcessingTime = Date.now() - batchStartTime;
                
                ProgressTracker.updateProgress(this.jobId, {
                    name: `Batch ${batchIndex + 1}`,
                    description: `Processed ${batch.length} items`,
                    data: {
                        batchIndex: batchIndex + 1,
                        itemsInBatch: batch.length,
                        processingTime: batchProcessingTime,
                        totalProcessed: results.length,
                    },
                });

            } catch (error) {
                ProgressTracker.addError(this.jobId, {
                    message: `Error in batch ${batchIndex + 1}`,
                    error: error as Error,
                    fatal: this.options?.stopOnError || false,
                    data: { batchIndex: batchIndex + 1 },
                });

                if (this.options?.stopOnError) {
                    break;
                }
            }
        }

        return results;
    }

    /**
     * 진행 상황 콜백 설정
     */
    withProgress(callback: (progress: ProgressJob) => void): this {
        const checkProgress = () => {
            const job = ProgressTracker.getJob(this.jobId);
            if (job) {
                callback(job as ProgressJob);
                if (job.status === 'in_progress') {
                    setTimeout(checkProgress, 500);
                }
            }
        };

        setTimeout(checkProgress, 100);
        return this;
    }

    /**
     * 작업 취소
     */
    cancel(): void {
        this.cancelled = true;
        ProgressTracker.cancelJob(this.jobId);
    }

    private chunkArray(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}

/**
 * 파일 처리 작업 관리자
 */
export class FileProcessingJobManager {
    private job: ProgressJob;
    private cancelled = false;

    constructor(
        private jobId: string,
        private fileName: string,
        private fileSize: number,
        private processor: FileProcessor
    ) {
        this.job = ProgressTracker.createJob(
            jobId,
            100, // 퍼센트 기반
            {
                fileName,
                fileSize,
                type: 'file_processing',
            }
        );
    }

    /**
     * 파일 처리 실행
     */
    async execute(): Promise<any> {
        const progressCallback = (bytesProcessed: number) => {
            const percentage = Math.round((bytesProcessed / this.fileSize) * 100);
            
            ProgressTracker.updateProgress(this.jobId, {
                name: 'File Processing',
                description: `Processing ${this.fileName}`,
                data: {
                    bytesProcessed,
                    totalBytes: this.fileSize,
                    percentage,
                },
            }, false);

            // currentStep을 퍼센트로 설정
            const job = ProgressTracker.getJob(this.jobId) as ProgressJob;
            if (job) {
                job.currentStep = percentage;
                job.percentage = percentage;
            }
        };

        try {
            return await this.processor(this.fileName, progressCallback);
        } catch (error) {
            ProgressTracker.addError(this.jobId, {
                message: `Error processing file ${this.fileName}`,
                error: error as Error,
                fatal: true,
            });
            throw error;
        }
    }

    /**
     * 작업 취소
     */
    cancel(): void {
        this.cancelled = true;
        ProgressTracker.cancelJob(this.jobId);
    }
}

// 타입 정의들
export interface ProgressJob {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    currentStep: number;
    totalSteps: number;
    percentage: number;
    startTime: number;
    estimatedCompletion: number | null;
    metadata: Record<string, any>;
    steps: StepInfo[];
    errors: JobError[];
    warnings: JobWarning[];
}

export interface CompletedJob extends ProgressJob {
    endTime: number;
    duration: number;
}

export interface StepInfo {
    name: string;
    description: string;
    timestamp?: number;
    stepNumber?: number;
    data?: Record<string, any>;
}

export interface JobError {
    message: string;
    error: Error;
    fatal: boolean;
    timestamp?: number;
    data?: Record<string, any>;
}

export interface JobWarning {
    message: string;
    timestamp?: number;
    data?: Record<string, any>;
}

export interface BatchJobOptions {
    jobId?: string;
    batchSize?: number;
    stopOnError?: boolean;
}

export type FileProcessor = (
    fileName: string,
    progressCallback: (bytesProcessed: number) => void
) => Promise<any>;