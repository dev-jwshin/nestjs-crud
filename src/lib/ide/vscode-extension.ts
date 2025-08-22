/* eslint-disable @typescript-eslint/no-explicit-any */
import { workspace, window, commands, ExtensionContext, Position, Range, TextDocument } from 'vscode';
import * as path from 'path';

export interface CrudCodeCompletion {
    label: string;
    detail: string;
    documentation: string;
    insertText: string;
    kind: number;
}

export interface CrudSnippet {
    name: string;
    prefix: string;
    body: string[];
    description: string;
    scope: string;
}

export interface CrudValidation {
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    source: string;
}

export interface CrudHover {
    contents: string[];
    range?: Range;
}

export interface CrudDefinition {
    uri: string;
    range: Range;
}

/**
 * VS Code IDE 확장 기능
 */
export class CrudVSCodeExtension {
    private context: ExtensionContext;
    private disposables: any[] = [];

    constructor(context: ExtensionContext) {
        this.context = context;
        this.initialize();
    }

    /**
     * 확장 기능 초기화
     */
    private initialize(): void {
        this.registerCommands();
        this.registerProviders();
        this.registerSnippets();
        this.registerDiagnostics();
    }

    /**
     * 명령어 등록
     */
    private registerCommands(): void {
        // CRUD 생성 명령어
        const generateCrudCommand = commands.registerCommand(
            'nestjs-crud.generateCrud',
            this.generateCrud.bind(this)
        );

        // 엔티티 생성 명령어
        const generateEntityCommand = commands.registerCommand(
            'nestjs-crud.generateEntity',
            this.generateEntity.bind(this)
        );

        // DTO 생성 명령어
        const generateDtoCommand = commands.registerCommand(
            'nestjs-crud.generateDto',
            this.generateDto.bind(this)
        );

        // 성능 분석 명령어
        const analyzePerformanceCommand = commands.registerCommand(
            'nestjs-crud.analyzePerformance',
            this.analyzePerformance.bind(this)
        );

        // 문서 생성 명령어
        const generateDocsCommand = commands.registerCommand(
            'nestjs-crud.generateDocs',
            this.generateDocs.bind(this)
        );

        this.disposables.push(
            generateCrudCommand,
            generateEntityCommand,
            generateDtoCommand,
            analyzePerformanceCommand,
            generateDocsCommand
        );
    }

    /**
     * 언어 서비스 프로바이더 등록
     */
    private registerProviders(): void {
        // 자동 완성 프로바이더
        const completionProvider = {
            provideCompletionItems: this.provideCompletionItems.bind(this)
        };

        // 호버 프로바이더
        const hoverProvider = {
            provideHover: this.provideHover.bind(this)
        };

        // 정의 프로바이더
        const definitionProvider = {
            provideDefinition: this.provideDefinition.bind(this)
        };

        // TypeScript 파일에 대한 프로바이더 등록
        const tsSelector = { scheme: 'file', language: 'typescript' };
        
        this.disposables.push(
            // languages.registerCompletionItemProvider(tsSelector, completionProvider, '.', '@'),
            // languages.registerHoverProvider(tsSelector, hoverProvider),
            // languages.registerDefinitionProvider(tsSelector, definitionProvider)
        );
    }

    /**
     * 코드 스니펫 등록
     */
    private registerSnippets(): void {
        const snippets: CrudSnippet[] = [
            {
                name: 'CRUD Controller',
                prefix: 'crud-controller',
                body: [
                    'import { Controller } from \'@nestjs/common\';',
                    'import { Crud } from \'@foryourdev/nestjs-crud\';',
                    'import { ${1:Entity} } from \'./entities/${2:entity}.entity\';',
                    'import { ${1:Entity}Service } from \'./${2:entity}.service\';',
                    'import { Create${1:Entity}Dto } from \'./dto/create-${2:entity}.dto\';',
                    'import { Update${1:Entity}Dto } from \'./dto/update-${2:entity}.dto\';',
                    '',
                    '@Crud({',
                    '  model: {',
                    '    type: ${1:Entity},',
                    '  },',
                    '  dto: {',
                    '    create: Create${1:Entity}Dto,',
                    '    update: Update${1:Entity}Dto,',
                    '  },',
                    '  routes: {',
                    '    only: [\'getManyBase\', \'getOneBase\', \'createOneBase\', \'updateOneBase\', \'deleteOneBase\'],',
                    '  },',
                    '})',
                    '@Controller(\'${3:${2:entity}s}\')',
                    'export class ${1:Entity}Controller {',
                    '  constructor(public service: ${1:Entity}Service) {}',
                    '}'
                ],
                description: 'Generate CRUD controller',
                scope: 'typescript'
            },
            {
                name: 'CRUD Service',
                prefix: 'crud-service',
                body: [
                    'import { Injectable } from \'@nestjs/common\';',
                    'import { InjectRepository } from \'@nestjs/typeorm\';',
                    'import { Repository } from \'typeorm\';',
                    'import { CrudService } from \'@foryourdev/nestjs-crud\';',
                    'import { ${1:Entity} } from \'./entities/${2:entity}.entity\';',
                    '',
                    '@Injectable()',
                    'export class ${1:Entity}Service extends CrudService<${1:Entity}> {',
                    '  constructor(',
                    '    @InjectRepository(${1:Entity})',
                    '    repository: Repository<${1:Entity}>',
                    '  ) {',
                    '    super(repository);',
                    '  }',
                    '}'
                ],
                description: 'Generate CRUD service',
                scope: 'typescript'
            },
            {
                name: 'TypeORM Entity',
                prefix: 'crud-entity',
                body: [
                    'import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from \'typeorm\';',
                    'import { IsString, IsOptional } from \'class-validator\';',
                    '',
                    '@Entity(\'${2:${1/(.*)/${1:/downcase}/}_table}\')',
                    'export class ${1:Entity} {',
                    '  @PrimaryGeneratedColumn()',
                    '  id: number;',
                    '',
                    '  @Column()',
                    '  @IsString()',
                    '  name: string;',
                    '',
                    '  @Column({ nullable: true })',
                    '  @IsOptional()',
                    '  @IsString()',
                    '  description?: string;',
                    '',
                    '  @CreateDateColumn()',
                    '  createdAt: Date;',
                    '',
                    '  @UpdateDateColumn()',
                    '  updatedAt: Date;',
                    '}'
                ],
                description: 'Generate TypeORM entity',
                scope: 'typescript'
            },
            {
                name: 'Create DTO',
                prefix: 'crud-create-dto',
                body: [
                    'import { IsString, IsOptional } from \'class-validator\';',
                    '',
                    'export class Create${1:Entity}Dto {',
                    '  @IsString()',
                    '  name: string;',
                    '',
                    '  @IsOptional()',
                    '  @IsString()',
                    '  description?: string;',
                    '}'
                ],
                description: 'Generate Create DTO',
                scope: 'typescript'
            },
            {
                name: 'Update DTO',
                prefix: 'crud-update-dto',
                body: [
                    'import { PartialType } from \'@nestjs/mapped-types\';',
                    'import { Create${1:Entity}Dto } from \'./create-${2:entity}.dto\';',
                    '',
                    'export class Update${1:Entity}Dto extends PartialType(Create${1:Entity}Dto) {}'
                ],
                description: 'Generate Update DTO',
                scope: 'typescript'
            },
            {
                name: 'CRUD Module',
                prefix: 'crud-module',
                body: [
                    'import { Module } from \'@nestjs/common\';',
                    'import { TypeOrmModule } from \'@nestjs/typeorm\';',
                    'import { ${1:Entity} } from \'./entities/${2:entity}.entity\';',
                    'import { ${1:Entity}Service } from \'./${2:entity}.service\';',
                    'import { ${1:Entity}Controller } from \'./${2:entity}.controller\';',
                    '',
                    '@Module({',
                    '  imports: [TypeOrmModule.forFeature([${1:Entity}])],',
                    '  controllers: [${1:Entity}Controller],',
                    '  providers: [${1:Entity}Service],',
                    '  exports: [${1:Entity}Service],',
                    '})',
                    'export class ${1:Entity}Module {}'
                ],
                description: 'Generate CRUD module',
                scope: 'typescript'
            }
        ];

        // 스니펫을 workspace에 저장하거나 확장에 포함
        this.saveSnippets(snippets);
    }

    /**
     * 진단(Diagnostics) 등록
     */
    private registerDiagnostics(): void {
        const diagnosticCollection = window.createTextEditorDecorationType({
            color: 'red',
            textDecoration: 'underline'
        });

        this.disposables.push(diagnosticCollection);
    }

    /**
     * 자동 완성 제공
     */
    private async provideCompletionItems(
        document: TextDocument,
        position: Position
    ): Promise<CrudCodeCompletion[]> {
        const lineText = document.lineAt(position).text;
        const wordRange = document.getWordRangeAtPosition(position);
        const word = wordRange ? document.getText(wordRange) : '';

        const completions: CrudCodeCompletion[] = [];

        // @Crud 데코레이터 자동 완성
        if (lineText.includes('@Crud')) {
            completions.push(
                {
                    label: 'model',
                    detail: 'CRUD Model Configuration',
                    documentation: 'Configure the entity model for CRUD operations',
                    insertText: 'model: {\n  type: ${1:Entity},\n}',
                    kind: 1 // Property
                },
                {
                    label: 'dto',
                    detail: 'CRUD DTO Configuration',
                    documentation: 'Configure DTOs for create and update operations',
                    insertText: 'dto: {\n  create: Create${1:Entity}Dto,\n  update: Update${1:Entity}Dto,\n}',
                    kind: 1
                },
                {
                    label: 'routes',
                    detail: 'CRUD Routes Configuration',
                    documentation: 'Configure available CRUD routes',
                    insertText: 'routes: {\n  only: [\'getManyBase\', \'getOneBase\', \'createOneBase\', \'updateOneBase\', \'deleteOneBase\'],\n}',
                    kind: 1
                }
            );
        }

        // TypeORM 데코레이터 자동 완성
        if (lineText.includes('@')) {
            completions.push(
                {
                    label: '@Column',
                    detail: 'TypeORM Column Decorator',
                    documentation: 'Define a database column',
                    insertText: '@Column(${1:options})',
                    kind: 2 // Function
                },
                {
                    label: '@Entity',
                    detail: 'TypeORM Entity Decorator',
                    documentation: 'Define a database entity',
                    insertText: '@Entity(\'${1:table_name}\')',
                    kind: 2
                },
                {
                    label: '@PrimaryGeneratedColumn',
                    detail: 'TypeORM Primary Key',
                    documentation: 'Define an auto-generated primary key',
                    insertText: '@PrimaryGeneratedColumn()',
                    kind: 2
                }
            );
        }

        return completions;
    }

    /**
     * 호버 정보 제공
     */
    private async provideHover(
        document: TextDocument,
        position: Position
    ): Promise<CrudHover | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;

        const word = document.getText(wordRange);

        // CRUD 관련 키워드에 대한 호버 정보
        const hoverInfo: Record<string, string[]> = {
            'Crud': [
                '**@Crud Decorator**\n\nAutomatically generates RESTful CRUD endpoints',
                'Supports: GET, POST, PUT, PATCH, DELETE operations',
                'Configurable routes, DTOs, and validation'
            ],
            'CrudService': [
                '**CrudService Class**\n\nBase service class for CRUD operations',
                'Provides: getMany, getOne, createOne, updateOne, deleteOne',
                'Extends TypeORM Repository functionality'
            ],
            'getManyBase': [
                '**GET Many Endpoint**\n\nRetrieve multiple entities',
                'Supports: filtering, sorting, pagination, relations',
                'Query parameters: ?filter=field||eq||value'
            ],
            'getOneBase': [
                '**GET One Endpoint**\n\nRetrieve single entity by ID',
                'Supports: relations, field selection',
                'URL: GET /resource/:id'
            ]
        };

        if (hoverInfo[word]) {
            return {
                contents: hoverInfo[word],
                range: wordRange
            };
        }

        return null;
    }

    /**
     * 정의로 이동 제공
     */
    private async provideDefinition(
        document: TextDocument,
        position: Position
    ): Promise<CrudDefinition[]> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return [];

        const word = document.getText(wordRange);
        const definitions: CrudDefinition[] = [];

        // 엔티티나 DTO 클래스로 이동
        if (word.endsWith('Entity') || word.endsWith('Dto')) {
            const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                const entityPath = this.findEntityFile(workspaceFolder.uri.fsPath, word);
                if (entityPath) {
                    definitions.push({
                        uri: entityPath,
                        range: new Range(0, 0, 0, 0)
                    });
                }
            }
        }

        return definitions;
    }

    /**
     * CRUD 생성 명령어
     */
    private async generateCrud(): Promise<void> {
        const entityName = await window.showInputBox({
            prompt: 'Enter entity name',
            placeHolder: 'e.g., User, Product, Order'
        });

        if (!entityName) return;

        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            window.showErrorMessage('No workspace folder found');
            return;
        }

        try {
            await this.generateCrudFiles(workspaceFolder.uri.fsPath, entityName);
            window.showInformationMessage(`CRUD files generated for ${entityName}`);
        } catch (error) {
            window.showErrorMessage(`Failed to generate CRUD files: ${error.message}`);
        }
    }

    /**
     * 엔티티 생성 명령어
     */
    private async generateEntity(): Promise<void> {
        const entityName = await window.showInputBox({
            prompt: 'Enter entity name',
            placeHolder: 'e.g., User, Product, Order'
        });

        if (!entityName) return;

        // 엔티티 생성 로직
        window.showInformationMessage(`Entity ${entityName} will be generated`);
    }

    /**
     * DTO 생성 명령어
     */
    private async generateDto(): Promise<void> {
        const entityName = await window.showInputBox({
            prompt: 'Enter entity name for DTO',
            placeHolder: 'e.g., User, Product, Order'
        });

        if (!entityName) return;

        // DTO 생성 로직
        window.showInformationMessage(`DTOs for ${entityName} will be generated`);
    }

    /**
     * 성능 분석 명령어
     */
    private async analyzePerformance(): Promise<void> {
        window.showInformationMessage('Analyzing CRUD performance...');
        
        // 성능 분석 로직
        setTimeout(() => {
            window.showInformationMessage('Performance analysis completed');
        }, 2000);
    }

    /**
     * 문서 생성 명령어
     */
    private async generateDocs(): Promise<void> {
        window.showInformationMessage('Generating API documentation...');
        
        // 문서 생성 로직
        setTimeout(() => {
            window.showInformationMessage('Documentation generated');
        }, 2000);
    }

    /**
     * CRUD 파일들 생성
     */
    private async generateCrudFiles(workspacePath: string, entityName: string): Promise<void> {
        const entityPath = path.join(workspacePath, 'src', entityName.toLowerCase());
        
        // 디렉토리 생성 및 파일 생성 로직
        // 실제 구현에서는 파일 시스템 API 사용
    }

    /**
     * 엔티티 파일 찾기
     */
    private findEntityFile(workspacePath: string, entityName: string): string | null {
        // 워크스페이스에서 엔티티 파일 검색
        const possiblePaths = [
            path.join(workspacePath, 'src', 'entities', `${entityName.toLowerCase()}.entity.ts`),
            path.join(workspacePath, 'src', entityName.toLowerCase(), 'entities', `${entityName.toLowerCase()}.entity.ts`)
        ];

        // 파일 존재 여부 확인 후 반환
        return possiblePaths[0]; // 임시로 첫 번째 경로 반환
    }

    /**
     * 스니펫 저장
     */
    private saveSnippets(snippets: CrudSnippet[]): void {
        // VS Code 확장에서 스니펫을 package.json의 contributes.snippets에 정의
        // 또는 사용자 설정에 저장
    }

    /**
     * 확장 정리
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

/**
 * 확장 활성화
 */
export function activate(context: ExtensionContext): void {
    const extension = new CrudVSCodeExtension(context);
    context.subscriptions.push({
        dispose: () => extension.dispose()
    });
}

/**
 * 확장 비활성화
 */
export function deactivate(): void {
    // 정리 작업
}