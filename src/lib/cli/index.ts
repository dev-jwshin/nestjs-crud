#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CrudCliHandler } from './code-generator';
import { MigrationGenerator } from './migration-generator';
import { DocumentationGenerator } from './documentation-generator';

/**
 * NestJS CRUD CLI 도구
 */
class CrudCli {
    private codeHandler = new CrudCliHandler();
    private migrationHandler = new MigrationGenerator();
    private docHandler = new DocumentationGenerator();

    /**
     * CLI 실행
     */
    async run(args: string[]): Promise<void> {
        const [command, ...commandArgs] = args.slice(2);

        try {
            switch (command) {
                case 'generate':
                case 'g':
                    await this.handleGenerate(commandArgs);
                    break;
                
                case 'migration':
                case 'm':
                    await this.handleMigration(commandArgs);
                    break;
                
                case 'docs':
                case 'd':
                    await this.handleDocs(commandArgs);
                    break;
                
                case 'help':
                case '-h':
                case '--help':
                    this.showHelp();
                    break;
                
                case 'version':
                case '-v':
                case '--version':
                    this.showVersion();
                    break;
                
                default:
                    console.error(`Unknown command: ${command}`);
                    this.showHelp();
                    process.exit(1);
            }
        } catch (error) {
            console.error(`❌ Error: ${(error as Error).message}`);
            process.exit(1);
        }
    }

    /**
     * generate 명령어 처리
     */
    private async handleGenerate(args: string[]): Promise<void> {
        const [subCommand, ...subArgs] = args;

        switch (subCommand) {
            case 'crud':
                await this.codeHandler.handleGenerate(subArgs);
                break;
            
            case 'controller':
                await this.generateController(subArgs);
                break;
            
            case 'service':
                await this.generateService(subArgs);
                break;
            
            case 'entity':
                await this.generateEntity(subArgs);
                break;
            
            case 'dto':
                await this.generateDto(subArgs);
                break;
            
            case 'module':
                await this.generateModule(subArgs);
                break;
            
            default:
                console.error(`Unknown generate command: ${subCommand}`);
                this.showGenerateHelp();
        }
    }

    /**
     * migration 명령어 처리
     */
    private async handleMigration(args: string[]): Promise<void> {
        const [subCommand, ...subArgs] = args;

        switch (subCommand) {
            case 'create':
                await this.migrationHandler.createMigration(subArgs);
                break;
            
            case 'run':
                await this.migrationHandler.runMigrations(subArgs);
                break;
            
            case 'revert':
                await this.migrationHandler.revertMigration(subArgs);
                break;
            
            case 'status':
                await this.migrationHandler.showStatus(subArgs);
                break;
            
            default:
                console.error(`Unknown migration command: ${subCommand}`);
                this.showMigrationHelp();
        }
    }

    /**
     * docs 명령어 처리
     */
    private async handleDocs(args: string[]): Promise<void> {
        const [subCommand, ...subArgs] = args;

        switch (subCommand) {
            case 'generate':
                await this.docHandler.generateDocs(subArgs);
                break;
            
            case 'serve':
                await this.docHandler.serveDocs(subArgs);
                break;
            
            default:
                console.error(`Unknown docs command: ${subCommand}`);
                this.showDocsHelp();
        }
    }

    /**
     * 컨트롤러 생성
     */
    private async generateController(args: string[]): Promise<void> {
        console.log('🎮 Generating controller...');
        // 컨트롤러만 생성하는 로직
    }

    /**
     * 서비스 생성
     */
    private async generateService(args: string[]): Promise<void> {
        console.log('⚙️ Generating service...');
        // 서비스만 생성하는 로직
    }

    /**
     * 엔티티 생성
     */
    private async generateEntity(args: string[]): Promise<void> {
        console.log('🏗️ Generating entity...');
        // 엔티티만 생성하는 로직
    }

    /**
     * DTO 생성
     */
    private async generateDto(args: string[]): Promise<void> {
        console.log('📦 Generating DTO...');
        // DTO만 생성하는 로직
    }

    /**
     * 모듈 생성
     */
    private async generateModule(args: string[]): Promise<void> {
        console.log('📋 Generating module...');
        // 모듈만 생성하는 로직
    }

    /**
     * 도움말 표시
     */
    private showHelp(): void {
        console.log(`
🚀 NestJS CRUD CLI

Usage: nestjs-crud <command> [options]

Commands:
  generate, g     Generate CRUD code
  migration, m    Database migration tools
  docs, d         Documentation tools
  help, -h        Show help
  version, -v     Show version

Examples:
  nestjs-crud generate crud --entity User --output ./src/user
  nestjs-crud migration create --name AddUserTable
  nestjs-crud docs generate --output ./docs

For more information on a specific command:
  nestjs-crud <command> --help
        `);
    }

    /**
     * generate 명령어 도움말
     */
    private showGenerateHelp(): void {
        console.log(`
🎯 Generate Commands

Usage: nestjs-crud generate <type> [options]

Types:
  crud         Generate complete CRUD setup
  controller   Generate controller only
  service      Generate service only
  entity       Generate entity only
  dto          Generate DTOs only
  module       Generate module only

Options for crud:
  --entity, -e <name>      Entity name (required)
  --output, -o <path>      Output directory (default: ./src)
  --database, -d <type>    Database type (mysql|postgres|sqlite|mongodb)
  --dry-run               Show what would be generated without creating files
  --skip-existing         Skip existing files

Examples:
  nestjs-crud g crud -e User -o ./src/user
  nestjs-crud g controller -e Product --output ./src/product
  nestjs-crud g crud --entity Order --database postgres --dry-run
        `);
    }

    /**
     * migration 명령어 도움말
     */
    private showMigrationHelp(): void {
        console.log(`
🔄 Migration Commands

Usage: nestjs-crud migration <command> [options]

Commands:
  create       Create a new migration
  run          Run pending migrations
  revert       Revert the last migration
  status       Show migration status

Options:
  --name, -n <name>        Migration name
  --config, -c <path>      Config file path
  --connection <name>      Connection name

Examples:
  nestjs-crud migration create --name AddUserTable
  nestjs-crud migration run
  nestjs-crud migration revert
  nestjs-crud migration status
        `);
    }

    /**
     * docs 명령어 도움말
     */
    private showDocsHelp(): void {
        console.log(`
📚 Documentation Commands

Usage: nestjs-crud docs <command> [options]

Commands:
  generate     Generate API documentation
  serve        Serve documentation locally

Options:
  --output, -o <path>      Output directory
  --format, -f <type>      Output format (html|markdown|json)
  --port, -p <number>      Server port (default: 3001)

Examples:
  nestjs-crud docs generate --output ./docs --format html
  nestjs-crud docs serve --port 3001
        `);
    }

    /**
     * 버전 표시
     */
    private showVersion(): void {
        try {
            const pkg = require('../../../package.json');
            console.log(`v${pkg.version}`);
        } catch {
            console.log('v0.0.0');
        }
    }
}

// CLI 실행
if (require.main === module) {
    const cli = new CrudCli();
    cli.run(process.argv).catch(error => {
        console.error('❌ CLI Error:', error);
        process.exit(1);
    });
}

export { CrudCli };
export * from './code-generator';
export * from './migration-generator';
export * from './documentation-generator';