/**
 * Deprecation warning utilities for legacy code migration
 */

import { CrudLogger } from '../provider/crud-logger';

export class DeprecationWarnings {
    private static warningsShown = new Set<string>();
    private static logger = new CrudLogger(true);

    /**
     * Show a deprecation warning once per session
     */
    static showOnce(feature: string, message: string, removalVersion: string = 'v1.0.0'): void {
        const warningKey = `${feature}:${message}`;
        
        if (this.warningsShown.has(warningKey)) {
            return;
        }

        this.warningsShown.add(warningKey);
        
        console.warn(
            `⚠️  DEPRECATION WARNING: ${feature}\n` +
            `   ${message}\n` +
            `   This feature will be removed in ${removalVersion}.\n` +
            `   See migration guide: https://github.com/dev-jwshin/nestjs-crud/blob/main/legacy.md`
        );
    }

    /**
     * Check for configuration-based hooks and warn
     */
    static checkConfigurationHooks(crudOptions: any): void {
        if (!crudOptions.routes) return;

        for (const [method, config] of Object.entries(crudOptions.routes)) {
            if ((config as any)?.hooks) {
                this.showOnce(
                    'Configuration-based Hooks',
                    `Configuration-based hooks in routes.${method}.hooks are deprecated. ` +
                    `Use decorator-based hooks (@BeforeCreate, @AfterUpdate, etc.) instead.`,
                    'v1.0.0'
                );
                break; // Only show once even if multiple routes have hooks
            }
        }
    }

    /**
     * Check for deprecated relations option
     */
    static checkRelationsOption(crudOptions: any): void {
        if (!crudOptions.routes) return;

        for (const [method, config] of Object.entries(crudOptions.routes)) {
            if ((config as any)?.relations !== undefined) {
                this.showOnce(
                    'Relations Option',
                    `The 'relations' option in routes.${method} is deprecated. ` +
                    `Use 'allowedIncludes' instead at the root level or per route.`,
                    'v1.0.0'
                );
                break;
            }
        }
    }

    /**
     * Check for all deprecated features
     */
    static checkAll(crudOptions: any): void {
        this.checkConfigurationHooks(crudOptions);
        this.checkRelationsOption(crudOptions);
    }

    /**
     * Clear all shown warnings (useful for testing)
     */
    static clearWarnings(): void {
        this.warningsShown.clear();
    }
}