/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export interface CodeGeneratorOptions {
    entityName: string;
    outputPath: string;
    database?: 'mysql' | 'postgres' | 'sqlite' | 'mongodb';
    features?: CodeGenerationFeature[];
    skipExisting?: boolean;
    dryRun?: boolean;
}

export interface CodeGenerationFeature {
    name: string;
    enabled: boolean;
    options?: Record<string, any>;
}

export interface GeneratedFile {
    path: string;
    content: string;
    type: 'controller' | 'service' | 'entity' | 'dto' | 'module' | 'spec';
}

export interface CodeGenerationResult {
    files: GeneratedFile[];
    stats: {
        created: number;
        skipped: number;
        errors: number;
    };
    errors: string[];
}

/**
 * 코드 자동 생성기
 */
export class CrudCodeGenerator {
    private templates = new Map<string, CodeTemplate>();

    constructor() {
        this.loadDefaultTemplates();
    }

    /**
     * CRUD 코드 생성
     */
    async generate(options: CodeGeneratorOptions): Promise<CodeGenerationResult> {
        const result: CodeGenerationResult = {
            files: [],
            stats: { created: 0, skipped: 0, errors: 0 },
            errors: []
        };

        try {
            // 엔티티 파일 생성
            const entityFile = await this.generateEntity(options);
            result.files.push(entityFile);

            // DTO 파일들 생성
            const dtoFiles = await this.generateDTOs(options);
            result.files.push(...dtoFiles);

            // 서비스 파일 생성
            const serviceFile = await this.generateService(options);
            result.files.push(serviceFile);

            // 컨트롤러 파일 생성
            const controllerFile = await this.generateController(options);
            result.files.push(controllerFile);

            // 모듈 파일 생성
            const moduleFile = await this.generateModule(options);
            result.files.push(moduleFile);

            // 테스트 파일들 생성
            if (this.isFeatureEnabled(options, 'tests')) {
                const testFiles = await this.generateTests(options);
                result.files.push(...testFiles);
            }

            // 파일 시스템에 쓰기
            if (!options.dryRun) {
                await this.writeFiles(result.files, options);
            }

            result.stats.created = result.files.length;
            
        } catch (error) {
            result.errors.push((error as Error).message);
            result.stats.errors++;
        }

        return result;
    }

    /**
     * 엔티티 파일 생성
     */
    private async generateEntity(options: CodeGeneratorOptions): Promise<GeneratedFile> {
        const template = this.templates.get('entity');
        if (!template) throw new Error('Entity template not found');
        const content = await template.render({
            entityName: options.entityName,
            className: this.pascalCase(options.entityName),
            tableName: this.snakeCase(options.entityName),
            database: options.database || 'mysql'
        });

        return {
            path: join(options.outputPath, 'entities', `${this.kebabCase(options.entityName)}.entity.ts`),
            content,
            type: 'entity'
        };
    }

    /**
     * DTO 파일들 생성
     */
    private async generateDTOs(options: CodeGeneratorOptions): Promise<GeneratedFile[]> {
        const dtos: GeneratedFile[] = [];
        const className = this.pascalCase(options.entityName);

        // Create DTO
        const createTemplate = this.templates.get('create-dto');
        if (!createTemplate) {
            throw new Error('Create DTO template not found');
        }
        const createContent = await createTemplate.render({
            entityName: options.entityName,
            className
        });

        dtos.push({
            path: join(options.outputPath, 'dto', `create-${this.kebabCase(options.entityName)}.dto.ts`),
            content: createContent,
            type: 'dto'
        });

        // Update DTO
        const updateTemplate = this.templates.get('update-dto');
        if (!updateTemplate) {
            throw new Error('Update DTO template not found');
        }
        const updateContent = await updateTemplate.render({
            entityName: options.entityName,
            className
        });

        dtos.push({
            path: join(options.outputPath, 'dto', `update-${this.kebabCase(options.entityName)}.dto.ts`),
            content: updateContent,
            type: 'dto'
        });

        return dtos;
    }

    /**
     * 서비스 파일 생성
     */
    private async generateService(options: CodeGeneratorOptions): Promise<GeneratedFile> {
        const template = this.templates.get('service');
        if (!template) throw new Error('Service template not found');
        const content = await template.render({
            entityName: options.entityName,
            className: this.pascalCase(options.entityName),
            serviceName: `${this.pascalCase(options.entityName)}Service`
        });

        return {
            path: join(options.outputPath, `${this.kebabCase(options.entityName)}.service.ts`),
            content,
            type: 'service'
        };
    }

    /**
     * 컨트롤러 파일 생성
     */
    private async generateController(options: CodeGeneratorOptions): Promise<GeneratedFile> {
        const template = this.templates.get('controller');
        if (!template) throw new Error('Controller template not found');
        const content = await template.render({
            entityName: options.entityName,
            className: this.pascalCase(options.entityName),
            controllerName: `${this.pascalCase(options.entityName)}Controller`,
            serviceName: `${this.pascalCase(options.entityName)}Service`,
            path: this.kebabCase(options.entityName)
        });

        return {
            path: join(options.outputPath, `${this.kebabCase(options.entityName)}.controller.ts`),
            content,
            type: 'controller'
        };
    }

    /**
     * 모듈 파일 생성
     */
    private async generateModule(options: CodeGeneratorOptions): Promise<GeneratedFile> {
        const template = this.templates.get('module');
        if (!template) throw new Error('Module template not found');
        const content = await template.render({
            entityName: options.entityName,
            className: this.pascalCase(options.entityName),
            moduleName: `${this.pascalCase(options.entityName)}Module`,
            controllerName: `${this.pascalCase(options.entityName)}Controller`,
            serviceName: `${this.pascalCase(options.entityName)}Service`
        });

        return {
            path: join(options.outputPath, `${this.kebabCase(options.entityName)}.module.ts`),
            content,
            type: 'module'
        };
    }

    /**
     * 테스트 파일들 생성
     */
    private async generateTests(options: CodeGeneratorOptions): Promise<GeneratedFile[]> {
        const tests: GeneratedFile[] = [];
        const className = this.pascalCase(options.entityName);

        // Service test
        const serviceTestTemplate = this.templates.get('service-test');
        if (!serviceTestTemplate) {
            throw new Error('Service test template not found');
        }
        const serviceTestContent = await serviceTestTemplate.render({
            entityName: options.entityName,
            className,
            serviceName: `${className}Service`
        });

        tests.push({
            path: join(options.outputPath, `${this.kebabCase(options.entityName)}.service.spec.ts`),
            content: serviceTestContent,
            type: 'spec'
        });

        // Controller test
        const controllerTestTemplate = this.templates.get('controller-test');
        if (!controllerTestTemplate) {
            throw new Error('Controller test template not found');
        }
        const controllerTestContent = await controllerTestTemplate.render({
            entityName: options.entityName,
            className,
            controllerName: `${className}Controller`,
            serviceName: `${className}Service`
        });

        tests.push({
            path: join(options.outputPath, `${this.kebabCase(options.entityName)}.controller.spec.ts`),
            content: controllerTestContent,
            type: 'spec'
        });

        return tests;
    }

    /**
     * 파일들을 디스크에 쓰기
     */
    private async writeFiles(files: GeneratedFile[], options: CodeGeneratorOptions): Promise<void> {
        for (const file of files) {
            const fullPath = file.path;
            const dir = dirname(fullPath);

            // 디렉토리 생성
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            // 파일이 이미 존재하고 건너뛰기 옵션이 활성화된 경우
            if (existsSync(fullPath) && options.skipExisting) {
                continue;
            }

            // 파일 쓰기
            writeFileSync(fullPath, file.content, 'utf8');
        }
    }

    /**
     * 기본 템플릿 로드
     */
    private loadDefaultTemplates(): void {
        // Entity 템플릿
        this.templates.set('entity', new CodeTemplate(`
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IsString, IsOptional, IsNumber } from 'class-validator';

@Entity('{{tableName}}')
export class {{className}} {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @IsString()
    name: string;

    @Column({ nullable: true })
    @IsOptional()
    @IsString()
    description?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
        `));

        // Create DTO 템플릿
        this.templates.set('create-dto', new CodeTemplate(`
import { IsString, IsOptional } from 'class-validator';

export class Create{{className}}Dto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;
}
        `));

        // Update DTO 템플릿
        this.templates.set('update-dto', new CodeTemplate(`
import { PartialType } from '@nestjs/mapped-types';
import { Create{{className}}Dto } from './create-{{entityName}}.dto';

export class Update{{className}}Dto extends PartialType(Create{{className}}Dto) {}
        `));

        // Service 템플릿
        this.templates.set('service', new CodeTemplate(`
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrudService } from '@foryourdev/nestjs-crud';
import { {{className}} } from './entities/{{entityName}}.entity';

@Injectable()
export class {{serviceName}} extends CrudService<{{className}}> {
    constructor(
        @InjectRepository({{className}})
        repository: Repository<{{className}}>
    ) {
        super(repository);
    }
}
        `));

        // Controller 템플릿
        this.templates.set('controller', new CodeTemplate(`
import { Controller } from '@nestjs/common';
import { Crud } from '@foryourdev/nestjs-crud';
import { {{className}} } from './entities/{{entityName}}.entity';
import { {{serviceName}} } from './{{entityName}}.service';
import { Create{{className}}Dto } from './dto/create-{{entityName}}.dto';
import { Update{{className}}Dto } from './dto/update-{{entityName}}.dto';

@Crud({
    model: {
        type: {{className}},
    },
    dto: {
        create: Create{{className}}Dto,
        update: Update{{className}}Dto,
    },
    routes: {
        only: ['getManyBase', 'getOneBase', 'createOneBase', 'updateOneBase', 'deleteOneBase'],
    },
    params: {
        id: {
            field: 'id',
            type: 'number',
            primary: true,
        },
    },
})
@Controller('{{path}}')
export class {{controllerName}} {
    constructor(public service: {{serviceName}}) {}
}
        `));

        // Module 템플릿
        this.templates.set('module', new CodeTemplate(`
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { {{className}} } from './entities/{{entityName}}.entity';
import { {{serviceName}} } from './{{entityName}}.service';
import { {{controllerName}} } from './{{entityName}}.controller';

@Module({
    imports: [TypeOrmModule.forFeature([{{className}}])],
    controllers: [{{controllerName}}],
    providers: [{{serviceName}}],
    exports: [{{serviceName}}],
})
export class {{moduleName}} {}
        `));

        // Service test 템플릿
        this.templates.set('service-test', new CodeTemplate(`
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { {{serviceName}} } from '../{{entityName}}.service';
import { {{className}} } from '../entities/{{entityName}}.entity';

const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
});

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe('{{serviceName}}', () => {
    let service: {{serviceName}};
    let repository: MockRepository<{{className}}>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                {{serviceName}},
                {
                    provide: getRepositoryToken({{className}}),
                    useValue: mockRepository(),
                },
            ],
        }).compile();

        service = module.get<{{serviceName}}>({{serviceName}});
        repository = module.get<MockRepository<{{className}}>>(getRepositoryToken({{className}}));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('find', () => {
        it('should return an array of {{entityName}}s', async () => {
            const expected = [{ id: 1, name: 'Test {{className}}' }];
            repository.find.mockResolvedValue(expected);

            const result = await service.getMany({});
            expect(result).toEqual(expected);
        });
    });
});
        `));

        // Controller test 템플릿
        this.templates.set('controller-test', new CodeTemplate(`
import { Test, TestingModule } from '@nestjs/testing';
import { {{controllerName}} } from '../{{entityName}}.controller';
import { {{serviceName}} } from '../{{entityName}}.service';

const mockService = () => ({
    getMany: jest.fn(),
    getOne: jest.fn(),
    createOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
});

describe('{{controllerName}}', () => {
    let controller: {{controllerName}};
    let service: jest.Mocked<{{serviceName}}>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [{{controllerName}}],
            providers: [
                {
                    provide: {{serviceName}},
                    useValue: mockService(),
                },
            ],
        }).compile();

        controller = module.get<{{controllerName}}>({{controllerName}});
        service = module.get({{serviceName}});
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
        `));
    }

    /**
     * 기능이 활성화되어 있는지 확인
     */
    private isFeatureEnabled(options: CodeGeneratorOptions, featureName: string): boolean {
        if (!options.features) return true;
        
        const feature = options.features.find(f => f.name === featureName);
        return feature ? feature.enabled : true;
    }

    /**
     * 템플릿 등록
     */
    registerTemplate(name: string, template: CodeTemplate): void {
        this.templates.set(name, template);
    }

    /**
     * 커스텀 생성기 등록
     */
    registerGenerator(name: string, generator: CustomGenerator): void {
        // 커스텀 생성기 등록 로직
    }

    // 유틸리티 메서드들
    private pascalCase(str: string): string {
        return str.replace(/(^\w|_\w)/g, (match) => 
            match.replace('_', '').toUpperCase()
        );
    }

    private kebabCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    private snakeCase(str: string): string {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }
}

/**
 * 코드 템플릿 클래스
 */
export class CodeTemplate {
    constructor(private template: string) {}

    async render(variables: Record<string, any>): Promise<string> {
        let result = this.template;
        
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        }
        
        return result.trim();
    }
}

/**
 * 커스텀 생성기 인터페이스
 */
export interface CustomGenerator {
    name: string;
    description: string;
    generate(options: CodeGeneratorOptions): Promise<GeneratedFile[]>;
}

/**
 * CLI 명령어 처리기
 */
export class CrudCliHandler {
    private generator = new CrudCodeGenerator();

    /**
     * generate 명령어 처리
     */
    async handleGenerate(args: string[]): Promise<void> {
        const options = this.parseGenerateArgs(args);
        
        console.log(`🚀 Generating CRUD code for ${options.entityName}...`);
        
        const result = await this.generator.generate(options);
        
        if (result.errors.length > 0) {
            console.error('❌ Errors occurred:');
            result.errors.forEach(error => console.error(`  - ${error}`));
        }
        
        console.log(`✅ Generated ${result.stats.created} files`);
        if (result.stats.skipped > 0) {
            console.log(`⏭️  Skipped ${result.stats.skipped} existing files`);
        }
        
        if (options.dryRun) {
            console.log('\n📋 Files that would be generated:');
            result.files.forEach(file => {
                console.log(`  - ${file.path} (${file.type})`);
            });
        }
    }

    /**
     * 명령행 인수 파싱
     */
    private parseGenerateArgs(args: string[]): CodeGeneratorOptions {
        const options: CodeGeneratorOptions = {
            entityName: '',
            outputPath: './src'
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '--entity':
                case '-e':
                    options.entityName = args[++i];
                    break;
                case '--output':
                case '-o':
                    options.outputPath = args[++i];
                    break;
                case '--database':
                case '-d':
                    options.database = args[++i] as any;
                    break;
                case '--dry-run':
                    options.dryRun = true;
                    break;
                case '--skip-existing':
                    options.skipExisting = true;
                    break;
            }
        }

        if (!options.entityName) {
            throw new Error('Entity name is required. Use --entity <name>');
        }

        return options;
    }
}

/**
 * 스키마 분석기
 */
export class SchemaAnalyzer {
    /**
     * 데이터베이스 스키마로부터 엔티티 생성
     */
    async generateFromSchema(
        connectionOptions: any,
        options: {
            tables?: string[];
            outputPath: string;
            skipExisting?: boolean;
        }
    ): Promise<CodeGenerationResult> {
        // 데이터베이스 연결 및 스키마 분석 로직
        throw new Error('Schema analysis not implemented yet');
    }

    /**
     * 기존 엔티티로부터 코드 생성
     */
    async generateFromEntity(
        entityPath: string,
        options: CodeGeneratorOptions
    ): Promise<CodeGenerationResult> {
        // 엔티티 파일 분석 및 코드 생성 로직
        throw new Error('Entity analysis not implemented yet');
    }
}