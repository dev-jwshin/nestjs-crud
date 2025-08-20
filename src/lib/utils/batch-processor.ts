/**
 * Batch processor for handling large bulk operations efficiently
 */
export class BatchProcessor {
    /**
     * Default batch size for database operations
     */
    static readonly DEFAULT_BATCH_SIZE = 50;
    
    /**
     * Split array into chunks of specified size
     */
    static chunk<T>(array: T[], size: number = this.DEFAULT_BATCH_SIZE): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    
    /**
     * Process items in batches with a callback function
     */
    static async processBatches<T, R>(
        items: T[],
        processor: (batch: T[]) => Promise<R[]>,
        batchSize: number = this.DEFAULT_BATCH_SIZE
    ): Promise<R[]> {
        const batches = this.chunk(items, batchSize);
        const results = await Promise.all(
            batches.map(batch => processor(batch))
        );
        return results.flat();
    }
    
    /**
     * Process items sequentially in batches (useful for rate-limited operations)
     */
    static async processSequentialBatches<T, R>(
        items: T[],
        processor: (batch: T[]) => Promise<R[]>,
        batchSize: number = this.DEFAULT_BATCH_SIZE,
        delayMs: number = 0
    ): Promise<R[]> {
        const batches = this.chunk(items, batchSize);
        const results: R[] = [];
        
        for (const batch of batches) {
            const batchResults = await processor(batch);
            results.push(...batchResults);
            
            // Add delay between batches if specified
            if (delayMs > 0 && batch !== batches[batches.length - 1]) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        return results;
    }
    
    /**
     * Get optimal batch size based on array length
     */
    static getOptimalBatchSize(totalItems: number): number {
        if (totalItems <= 10) return totalItems;
        if (totalItems <= 100) return 20;
        if (totalItems <= 500) return 50;
        if (totalItems <= 1000) return 100;
        return 200;
    }
}