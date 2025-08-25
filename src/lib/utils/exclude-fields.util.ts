import _ from 'lodash';

/**
 * Utility to exclude fields from response objects
 */
export class ExcludeFieldsUtil {
    /**
     * Exclude specified fields from a single object or array of objects
     */
    static exclude<T>(data: T | T[], fieldsToExclude?: string[]): T | T[] {
        if (!fieldsToExclude || fieldsToExclude.length === 0) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.excludeFromObject(item, fieldsToExclude)) as T[];
        }

        return this.excludeFromObject(data, fieldsToExclude) as T;
    }

    /**
     * Exclude fields from a single object
     */
    private static excludeFromObject<T>(obj: T, fieldsToExclude: string[]): T {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        // Deep clone to avoid mutating original
        const cloned = _.cloneDeep(obj);
        
        // Remove excluded fields
        fieldsToExclude.forEach(field => {
            if (field.includes('.')) {
                // Handle nested fields like 'user.password'
                _.unset(cloned, field);
            } else {
                delete (cloned as any)[field];
            }
        });

        return cloned;
    }

    /**
     * Merge global and route-specific exclude fields
     */
    static mergeExcludeFields(
        globalExclude?: string[],
        routeExclude?: string[]
    ): string[] | undefined {
        if (!globalExclude && !routeExclude) {
            return undefined;
        }

        const fields = new Set<string>();
        
        if (globalExclude) {
            globalExclude.forEach(field => fields.add(field));
        }
        
        if (routeExclude) {
            routeExclude.forEach(field => fields.add(field));
        }

        return Array.from(fields);
    }
}