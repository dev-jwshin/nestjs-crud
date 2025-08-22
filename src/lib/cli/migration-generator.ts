/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { Connection, createConnection, QueryRunner, MigrationInterface } from 'typeorm';

export interface MigrationOptions {
    name: string;
    configPath?: string;
    connectionName?: string;
    outputPath?: string;
    dryRun?: boolean;
}

export interface MigrationStatus {
    name: string;
    executed: boolean;
    executedAt?: Date;
    checksum?: string;
}

export interface MigrationResult {
    success: boolean;
    migrations: string[];
    errors: string[];
    executionTime: number;
}

/**
 * 마이그레이션 생성기
 */
export class MigrationGenerator {
    private connection?: Connection;
    private configPath: string = './ormconfig.json';

    /**
     * 새로운 마이그레이션 생성
     */
    async createMigration(args: string[]): Promise<void> {
        const options = this.parseMigrationArgs(args);
        
        if (!options.name) {
            throw new Error('Migration name is required. Use --name <MigrationName>');
        }

        console.log(`📝 Creating migration: ${options.name}`);

        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const className = `${options.name}${timestamp}`;
        const fileName = `${timestamp}-${options.name}.ts`;
        
        const migrationContent = this.generateMigrationTemplate(className, options.name);
        
        const outputDir = options.outputPath || './src/migrations';
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
        
        const filePath = join(outputDir, fileName);
        
        if (options.dryRun) {
            console.log(`📋 Would create: ${filePath}`);
            console.log(migrationContent);
            return;
        }

        writeFileSync(filePath, migrationContent, 'utf8');
        console.log(`✅ Created migration: ${filePath}`);
    }

    /**
     * 마이그레이션 실행
     */
    async runMigrations(args: string[]): Promise<void> {
        const options = this.parseMigrationArgs(args);
        
        console.log('🚀 Running migrations...');
        
        try {
            await this.initializeConnection(options);
            
            if (!this.connection) {
                throw new Error('Database connection failed');
            }

            const result = await this.executeMigrations(options);
            
            if (result.success) {
                console.log(`✅ Successfully executed ${result.migrations.length} migrations`);
                console.log(`⏱️  Execution time: ${result.executionTime}ms`);
                
                if (result.migrations.length > 0) {
                    console.log('\n📋 Executed migrations:');
                    result.migrations.forEach(migration => {
                        console.log(`  - ${migration}`);
                    });
                }
            } else {
                console.error('❌ Migration execution failed');
                result.errors.forEach(error => {
                    console.error(`  - ${error}`);
                });
            }
            
        } finally {
            if (this.connection?.isConnected) {
                await this.connection.close();
            }
        }
    }

    /**
     * 마이그레이션 되돌리기
     */
    async revertMigration(args: string[]): Promise<void> {
        const options = this.parseMigrationArgs(args);
        
        console.log('⏪ Reverting last migration...');
        
        try {
            await this.initializeConnection(options);
            
            if (!this.connection) {
                throw new Error('Database connection failed');
            }

            const lastMigration = await this.getLastExecutedMigration();
            
            if (!lastMigration) {
                console.log('ℹ️  No migrations to revert');
                return;
            }

            console.log(`🔄 Reverting: ${lastMigration}`);
            
            await this.connection.undoLastMigration();
            
            console.log(`✅ Successfully reverted: ${lastMigration}`);
            
        } finally {
            if (this.connection?.isConnected) {
                await this.connection.close();
            }
        }
    }

    /**
     * 마이그레이션 상태 표시
     */
    async showStatus(args: string[]): Promise<void> {
        const options = this.parseMigrationArgs(args);
        
        console.log('📊 Migration Status\n');
        
        try {
            await this.initializeConnection(options);
            
            if (!this.connection) {
                throw new Error('Database connection failed');
            }

            const migrations = await this.getMigrationStatus();
            
            if (migrations.length === 0) {
                console.log('ℹ️  No migrations found');
                return;
            }

            const pending = migrations.filter(m => !m.executed);
            const executed = migrations.filter(m => m.executed);
            
            console.log(`✅ Executed: ${executed.length}`);
            console.log(`⏳ Pending: ${pending.length}`);
            console.log();
            
            migrations.forEach(migration => {
                const status = migration.executed ? '✅' : '⏳';
                const date = migration.executedAt 
                    ? ` (${migration.executedAt.toISOString().split('T')[0]})`
                    : '';
                console.log(`${status} ${migration.name}${date}`);
            });
            
        } finally {
            if (this.connection?.isConnected) {
                await this.connection.close();
            }
        }
    }

    /**
     * 스키마 분석 및 마이그레이션 생성
     */
    async generateFromSchema(
        options: {
            sourceConfig: any;
            targetConfig: any;
            migrationName: string;
            outputPath?: string;
        }
    ): Promise<void> {
        console.log('🔍 Analyzing schema differences...');
        
        // 소스와 타겟 스키마 비교
        const differences = await this.compareSchemas(
            options.sourceConfig,
            options.targetConfig
        );
        
        if (differences.length === 0) {
            console.log('ℹ️  No schema differences found');
            return;
        }
        
        // 차이점을 기반으로 마이그레이션 생성
        const migrationContent = this.generateSchemaMigration(
            options.migrationName,
            differences
        );
        
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const fileName = `${timestamp}-${options.migrationName}.ts`;
        const outputPath = options.outputPath || './src/migrations';
        
        if (!existsSync(outputPath)) {
            mkdirSync(outputPath, { recursive: true });
        }
        
        const filePath = join(outputPath, fileName);
        writeFileSync(filePath, migrationContent, 'utf8');
        
        console.log(`✅ Generated migration: ${filePath}`);
        console.log(`📋 Found ${differences.length} schema differences`);
    }

    /**
     * 데이터베이스 연결 초기화
     */
    private async initializeConnection(options: MigrationOptions): Promise<void> {
        if (this.connection?.isConnected) {
            return;
        }

        const configPath = options.configPath || this.configPath;
        let config: any;

        try {
            if (existsSync(configPath)) {
                const configContent = readFileSync(configPath, 'utf8');
                config = JSON.parse(configContent);
            } else {
                // 기본 설정 사용
                config = this.getDefaultConfig();
            }

            // 연결 이름이 지정된 경우
            if (options.connectionName && Array.isArray(config)) {
                config = config.find((c: any) => c.name === options.connectionName);
                if (!config) {
                    throw new Error(`Connection '${options.connectionName}' not found`);
                }
            }

            this.connection = await createConnection(config);
            
        } catch (error) {
            throw new Error(`Failed to connect to database: ${error.message}`);
        }
    }

    /**
     * 마이그레이션 실행
     */
    private async executeMigrations(options: MigrationOptions): Promise<MigrationResult> {
        const startTime = Date.now();
        const result: MigrationResult = {
            success: false,
            migrations: [],
            errors: [],
            executionTime: 0
        };

        try {
            if (!this.connection) {
                throw new Error('No database connection');
            }

            const pendingMigrations = await this.connection.runMigrations({
                transaction: 'each',
            });

            result.migrations = pendingMigrations.map(m => m.name);
            result.success = true;
            
        } catch (error) {
            result.errors.push(error.message);
        }

        result.executionTime = Date.now() - startTime;
        return result;
    }

    /**
     * 마지막으로 실행된 마이그레이션 조회
     */
    private async getLastExecutedMigration(): Promise<string | null> {
        if (!this.connection) {
            return null;
        }

        const migrations = await this.connection.query(
            'SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1'
        );

        return migrations.length > 0 ? migrations[0].name : null;
    }

    /**
     * 마이그레이션 상태 조회
     */
    private async getMigrationStatus(): Promise<MigrationStatus[]> {
        if (!this.connection) {
            return [];
        }

        // 실제로는 파일 시스템과 데이터베이스를 비교해야 함
        const executedMigrations = await this.connection.query(
            'SELECT name, timestamp FROM migrations ORDER BY timestamp'
        );

        return executedMigrations.map((m: any) => ({
            name: m.name,
            executed: true,
            executedAt: new Date(m.timestamp)
        }));
    }

    /**
     * 스키마 비교
     */
    private async compareSchemas(sourceConfig: any, targetConfig: any): Promise<SchemaDifference[]> {
        // 스키마 비교 로직 구현
        return [];
    }

    /**
     * 마이그레이션 템플릿 생성
     */
    private generateMigrationTemplate(className: string, description: string): string {
        return `
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
    name = '${className}';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ${description} - 마이그레이션 로직을 여기에 작성하세요
        
        // 예시:
        // await queryRunner.query(\`
        //     CREATE TABLE \`user\` (
        //         \`id\` int NOT NULL AUTO_INCREMENT,
        //         \`name\` varchar(255) NOT NULL,
        //         \`email\` varchar(255) NOT NULL,
        //         \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        //         \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        //         PRIMARY KEY (\`id\`)
        //     ) ENGINE=InnoDB
        // \`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 롤백 로직을 여기에 작성하세요
        
        // 예시:
        // await queryRunner.query(\`DROP TABLE \`user\`\`);
    }
}
        `.trim();
    }

    /**
     * 스키마 마이그레이션 생성
     */
    private generateSchemaMigration(name: string, differences: SchemaDifference[]): string {
        const className = `${name}${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}`;
        
        const upQueries = differences.map(diff => this.generateUpQuery(diff)).join('\n        ');
        const downQueries = differences.map(diff => this.generateDownQuery(diff)).join('\n        ');

        return `
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
    name = '${className}';

    public async up(queryRunner: QueryRunner): Promise<void> {
        ${upQueries}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        ${downQueries}
    }
}
        `.trim();
    }

    /**
     * UP 쿼리 생성
     */
    private generateUpQuery(difference: SchemaDifference): string {
        switch (difference.type) {
            case 'table-create':
                return `await queryRunner.query(\`${difference.query}\`);`;
            case 'table-drop':
                return `await queryRunner.query(\`${difference.query}\`);`;
            case 'column-add':
                return `await queryRunner.query(\`${difference.query}\`);`;
            case 'column-drop':
                return `await queryRunner.query(\`${difference.query}\`);`;
            default:
                return `await queryRunner.query(\`${difference.query}\`);`;
        }
    }

    /**
     * DOWN 쿼리 생성
     */
    private generateDownQuery(difference: SchemaDifference): string {
        // UP의 역순 쿼리 생성
        return `await queryRunner.query(\`${difference.rollbackQuery || ''}\`);`;
    }

    /**
     * 기본 설정 반환
     */
    private getDefaultConfig(): any {
        return {
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'root',
            password: '',
            database: 'test',
            entities: ['src/**/*.entity.ts'],
            migrations: ['src/migrations/*.ts'],
            cli: {
                migrationsDir: 'src/migrations'
            }
        };
    }

    /**
     * 명령행 인수 파싱
     */
    private parseMigrationArgs(args: string[]): MigrationOptions {
        const options: MigrationOptions = {
            name: ''
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '--name':
                case '-n':
                    options.name = args[++i];
                    break;
                case '--config':
                case '-c':
                    options.configPath = args[++i];
                    break;
                case '--connection':
                    options.connectionName = args[++i];
                    break;
                case '--output':
                case '-o':
                    options.outputPath = args[++i];
                    break;
                case '--dry-run':
                    options.dryRun = true;
                    break;
            }
        }

        return options;
    }
}

/**
 * 스키마 차이점 인터페이스
 */
interface SchemaDifference {
    type: 'table-create' | 'table-drop' | 'column-add' | 'column-drop' | 'index-add' | 'index-drop';
    table: string;
    column?: string;
    query: string;
    rollbackQuery?: string;
}

/**
 * 자동 마이그레이션 분석기
 */
export class AutoMigrationAnalyzer {
    /**
     * 엔티티 변경사항 분석
     */
    async analyzeEntityChanges(
        oldEntitiesPath: string,
        newEntitiesPath: string
    ): Promise<SchemaDifference[]> {
        // 엔티티 파일 비교 및 변경사항 분석
        return [];
    }

    /**
     * 데이터베이스 스키마 스캔
     */
    async scanDatabaseSchema(connection: Connection): Promise<SchemaInfo> {
        const queryRunner = connection.createQueryRunner();
        
        try {
            // 테이블 정보 조회
            const tables = await this.scanTables(queryRunner);
            
            // 각 테이블의 컬럼 정보 조회
            const schema: SchemaInfo = {
                tables: new Map()
            };
            
            for (const table of tables) {
                const columns = await this.scanTableColumns(queryRunner, table);
                const indexes = await this.scanTableIndexes(queryRunner, table);
                
                schema.tables.set(table, {
                    name: table,
                    columns,
                    indexes
                });
            }
            
            return schema;
            
        } finally {
            await queryRunner.release();
        }
    }

    private async scanTables(queryRunner: QueryRunner): Promise<string[]> {
        const result = await queryRunner.query('SHOW TABLES');
        return result.map((row: any) => Object.values(row)[0] as string);
    }

    private async scanTableColumns(queryRunner: QueryRunner, tableName: string): Promise<ColumnInfo[]> {
        const result = await queryRunner.query(`DESCRIBE ${tableName}`);
        return result.map((row: any) => ({
            name: row.Field,
            type: row.Type,
            nullable: row.Null === 'YES',
            key: row.Key,
            default: row.Default,
            extra: row.Extra
        }));
    }

    private async scanTableIndexes(queryRunner: QueryRunner, tableName: string): Promise<IndexInfo[]> {
        const result = await queryRunner.query(`SHOW INDEX FROM ${tableName}`);
        return result.map((row: any) => ({
            name: row.Key_name,
            column: row.Column_name,
            unique: row.Non_unique === 0
        }));
    }
}

interface SchemaInfo {
    tables: Map<string, TableInfo>;
}

interface TableInfo {
    name: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
}

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    key: string;
    default: any;
    extra: string;
}

interface IndexInfo {
    name: string;
    column: string;
    unique: boolean;
}