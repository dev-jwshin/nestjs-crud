/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * IntelliJ IDEA / WebStorm 플러그인
 * 
 * 이 파일은 IntelliJ Platform 플러그인 개발을 위한 TypeScript 기반 구조를 제공합니다.
 * 실제 플러그인은 Java/Kotlin으로 개발되어야 하지만, 여기서는 플러그인의 구조와
 * 기능을 TypeScript로 모델링합니다.
 */

export interface IntelliJAction {
    id: string;
    text: string;
    description: string;
    icon?: string;
    shortcut?: string;
}

export interface IntelliJIntention {
    text: string;
    familyName: string;
    isAvailable: (context: PsiElementContext) => boolean;
    invoke: (context: PsiElementContext) => void;
}

export interface PsiElementContext {
    element: PsiElement;
    file: PsiFile;
    project: Project;
    editor: Editor;
}

export interface PsiElement {
    text: string;
    parent: PsiElement | null;
    children: PsiElement[];
    elementType: string;
}

export interface PsiFile {
    name: string;
    virtualFile: VirtualFile;
    text: string;
}

export interface VirtualFile {
    path: string;
    name: string;
    extension: string;
}

export interface Project {
    name: string;
    basePath: string;
}

export interface Editor {
    document: Document;
    caretModel: CaretModel;
    selectionModel: SelectionModel;
}

export interface Document {
    text: string;
    lineCount: number;
}

export interface CaretModel {
    offset: number;
    logicalPosition: LogicalPosition;
}

export interface SelectionModel {
    selectedText: string | null;
    selectionStart: number;
    selectionEnd: number;
}

export interface LogicalPosition {
    line: number;
    column: number;
}

/**
 * NestJS CRUD IntelliJ 플러그인
 */
export class NestJSCrudIntelliJPlugin {
    private actions: Map<string, IntelliJAction> = new Map();
    private intentions: IntelliJIntention[] = [];
    private inspections: CrudInspection[] = [];

    constructor() {
        this.registerActions();
        this.registerIntentions();
        this.registerInspections();
    }

    /**
     * 액션 등록
     */
    private registerActions(): void {
        const actions: IntelliJAction[] = [
            {
                id: 'nestjs.crud.generateCrud',
                text: 'Generate CRUD',
                description: 'Generate CRUD controller, service, and related files',
                icon: 'crud-icon.png',
                shortcut: 'Ctrl+Alt+C'
            },
            {
                id: 'nestjs.crud.generateEntity',
                text: 'Generate Entity',
                description: 'Generate TypeORM entity class',
                icon: 'entity-icon.png',
                shortcut: 'Ctrl+Alt+E'
            },
            {
                id: 'nestjs.crud.generateDto',
                text: 'Generate DTO',
                description: 'Generate Create and Update DTOs',
                icon: 'dto-icon.png',
                shortcut: 'Ctrl+Alt+D'
            },
            {
                id: 'nestjs.crud.analyzePerformance',
                text: 'Analyze CRUD Performance',
                description: 'Analyze query performance and suggest optimizations',
                icon: 'performance-icon.png'
            },
            {
                id: 'nestjs.crud.generateDocs',
                text: 'Generate API Documentation',
                description: 'Generate API documentation from CRUD controllers',
                icon: 'docs-icon.png'
            }
        ];

        actions.forEach(action => {
            this.actions.set(action.id, action);
        });
    }

    /**
     * 의도 액션(Intention Actions) 등록
     */
    private registerIntentions(): void {
        this.intentions = [
            {
                text: 'Convert to CRUD Controller',
                familyName: 'NestJS CRUD',
                isAvailable: (context) => this.isRegularController(context),
                invoke: (context) => this.convertToCrudController(context)
            },
            {
                text: 'Add CRUD Service',
                familyName: 'NestJS CRUD',
                isAvailable: (context) => this.isEntityClass(context),
                invoke: (context) => this.addCrudService(context)
            },
            {
                text: 'Add Validation Decorators',
                familyName: 'NestJS CRUD',
                isAvailable: (context) => this.isDtoClass(context),
                invoke: (context) => this.addValidationDecorators(context)
            },
            {
                text: 'Generate DTOs from Entity',
                familyName: 'NestJS CRUD',
                isAvailable: (context) => this.isEntityClass(context),
                invoke: (context) => this.generateDtosFromEntity(context)
            },
            {
                text: 'Add CRUD Routes Configuration',
                familyName: 'NestJS CRUD',
                isAvailable: (context) => this.isCrudDecorator(context),
                invoke: (context) => this.addRoutesConfiguration(context)
            }
        ];
    }

    /**
     * 코드 검사(Inspections) 등록
     */
    private registerInspections(): void {
        this.inspections = [
            new MissingCrudDecoratorInspection(),
            new InvalidCrudConfigurationInspection(),
            new MissingValidationInspection(),
            new PerformanceIssueInspection(),
            new SecurityIssueInspection()
        ];
    }

    /**
     * 액션 실행
     */
    executeAction(actionId: string, context: PsiElementContext): void {
        switch (actionId) {
            case 'nestjs.crud.generateCrud':
                this.generateCrud(context);
                break;
            case 'nestjs.crud.generateEntity':
                this.generateEntity(context);
                break;
            case 'nestjs.crud.generateDto':
                this.generateDto(context);
                break;
            case 'nestjs.crud.analyzePerformance':
                this.analyzePerformance(context);
                break;
            case 'nestjs.crud.generateDocs':
                this.generateDocs(context);
                break;
        }
    }

    /**
     * CRUD 생성
     */
    private generateCrud(context: PsiElementContext): void {
        // 사용자로부터 엔티티 이름 입력 받기
        const entityName = this.showInputDialog('Enter entity name:', 'User');
        if (!entityName) return;

        // 프로젝트 구조 분석
        const projectStructure = this.analyzeProjectStructure(context.project);
        
        // 파일 생성
        this.createCrudFiles(context.project, entityName, projectStructure);
        
        // 성공 메시지 표시
        this.showInfoMessage(`CRUD files generated for ${entityName}`);
    }

    /**
     * 엔티티 생성
     */
    private generateEntity(context: PsiElementContext): void {
        const entityName = this.showInputDialog('Enter entity name:', 'User');
        if (!entityName) return;

        const entityTemplate = this.getEntityTemplate(entityName);
        this.createFile(context.project, `${entityName.toLowerCase()}.entity.ts`, entityTemplate);
    }

    /**
     * DTO 생성
     */
    private generateDto(context: PsiElementContext): void {
        const entityName = this.extractEntityName(context);
        if (!entityName) return;

        const createDtoTemplate = this.getCreateDtoTemplate(entityName);
        const updateDtoTemplate = this.getUpdateDtoTemplate(entityName);

        this.createFile(context.project, `create-${entityName.toLowerCase()}.dto.ts`, createDtoTemplate);
        this.createFile(context.project, `update-${entityName.toLowerCase()}.dto.ts`, updateDtoTemplate);
    }

    /**
     * 성능 분석
     */
    private analyzePerformance(context: PsiElementContext): void {
        // 프로젝트의 CRUD 컨트롤러들 찾기
        const crudControllers = this.findCrudControllers(context.project);
        
        // 성능 분석 실행
        const analysisResult = this.performPerformanceAnalysis(crudControllers);
        
        // 결과를 툴 윈도우에 표시
        this.showAnalysisResults(analysisResult);
    }

    /**
     * 문서 생성
     */
    private generateDocs(context: PsiElementContext): void {
        const crudControllers = this.findCrudControllers(context.project);
        const documentation = this.generateApiDocumentation(crudControllers);
        
        this.createFile(context.project, 'api-documentation.md', documentation);
        this.showInfoMessage('API documentation generated');
    }

    // 의도 액션 구현

    /**
     * 일반 컨트롤러를 CRUD 컨트롤러로 변환
     */
    private convertToCrudController(context: PsiElementContext): void {
        const classElement = this.findClassElement(context.element);
        if (!classElement) return;

        // @Crud 데코레이터 추가
        const crudDecorator = this.generateCrudDecorator();
        this.addDecoratorToClass(classElement, crudDecorator);

        // 필요한 import 추가
        this.addImports(context.file, [
            "import { Crud } from '@foryourdev/nestjs-crud';"
        ]);
    }

    /**
     * 엔티티에 CRUD 서비스 추가
     */
    private addCrudService(context: PsiElementContext): void {
        const entityName = this.extractEntityName(context);
        if (!entityName) return;

        const serviceTemplate = this.getServiceTemplate(entityName);
        this.createFile(context.project, `${entityName.toLowerCase()}.service.ts`, serviceTemplate);
    }

    /**
     * DTO에 유효성 검사 데코레이터 추가
     */
    private addValidationDecorators(context: PsiElementContext): void {
        const classElement = this.findClassElement(context.element);
        if (!classElement) return;

        const properties = this.getClassProperties(classElement);
        
        properties.forEach(property => {
            const validators = this.suggestValidators(property);
            this.addValidatorsToProperty(property, validators);
        });

        // 필요한 import 추가
        this.addImports(context.file, [
            "import { IsString, IsNumber, IsOptional } from 'class-validator';"
        ]);
    }

    /**
     * 엔티티로부터 DTO 생성
     */
    private generateDtosFromEntity(context: PsiElementContext): void {
        const entityElement = this.findClassElement(context.element);
        if (!entityElement) return;

        const entityName = this.getClassName(entityElement);
        const properties = this.getEntityProperties(entityElement);

        const createDto = this.generateCreateDtoFromProperties(entityName, properties);
        const updateDto = this.generateUpdateDtoFromProperties(entityName, properties);

        this.createFile(context.project, `create-${entityName.toLowerCase()}.dto.ts`, createDto);
        this.createFile(context.project, `update-${entityName.toLowerCase()}.dto.ts`, updateDto);
    }

    /**
     * CRUD 라우트 설정 추가
     */
    private addRoutesConfiguration(context: PsiElementContext): void {
        const decoratorElement = context.element;
        const currentConfig = this.parseCrudConfiguration(decoratorElement);

        const routesConfig = this.generateRoutesConfiguration();
        this.updateCrudConfiguration(decoratorElement, { ...currentConfig, routes: routesConfig });
    }

    // 유틸리티 메서드들

    private isRegularController(context: PsiElementContext): boolean {
        const classElement = this.findClassElement(context.element);
        return classElement !== null && 
               this.hasDecorator(classElement, 'Controller') &&
               !this.hasDecorator(classElement, 'Crud');
    }

    private isEntityClass(context: PsiElementContext): boolean {
        const classElement = this.findClassElement(context.element);
        return classElement !== null && this.hasDecorator(classElement, 'Entity');
    }

    private isDtoClass(context: PsiElementContext): boolean {
        const classElement = this.findClassElement(context.element);
        return classElement !== null && 
               (this.getClassName(classElement).endsWith('Dto') ||
                this.getClassName(classElement).endsWith('DTO'));
    }

    private isCrudDecorator(context: PsiElementContext): boolean {
        return context.element.text.includes('@Crud');
    }

    private findClassElement(element: PsiElement): PsiElement | null {
        let current = element;
        while (current && current.elementType !== 'CLASS') {
            current = current.parent!;
        }
        return current;
    }

    private hasDecorator(classElement: PsiElement, decoratorName: string): boolean {
        return classElement.text.includes(`@${decoratorName}`);
    }

    private getClassName(classElement: PsiElement): string {
        // 클래스 이름 추출 로직
        const match = classElement.text.match(/class\s+(\w+)/);
        return match ? match[1] : '';
    }

    private extractEntityName(context: PsiElementContext): string | null {
        const classElement = this.findClassElement(context.element);
        if (!classElement) return null;
        return this.getClassName(classElement);
    }

    private getEntityTemplate(entityName: string): string {
        return `
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IsString, IsOptional } from 'class-validator';

@Entity('${entityName.toLowerCase()}_table')
export class ${entityName} {
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
        `.trim();
    }

    private getCreateDtoTemplate(entityName: string): string {
        return `
import { IsString, IsOptional } from 'class-validator';

export class Create${entityName}Dto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
        `.trim();
    }

    private getUpdateDtoTemplate(entityName: string): string {
        return `
import { PartialType } from '@nestjs/mapped-types';
import { Create${entityName}Dto } from './create-${entityName.toLowerCase()}.dto';

export class Update${entityName}Dto extends PartialType(Create${entityName}Dto) {}
        `.trim();
    }

    private getServiceTemplate(entityName: string): string {
        return `
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrudService } from '@foryourdev/nestjs-crud';
import { ${entityName} } from './entities/${entityName.toLowerCase()}.entity';

@Injectable()
export class ${entityName}Service extends CrudService<${entityName}> {
  constructor(
    @InjectRepository(${entityName})
    repository: Repository<${entityName}>
  ) {
    super(repository);
  }
}
        `.trim();
    }

    // 플래그홀더 메서드들 (실제 IntelliJ API에서 구현)
    private showInputDialog(message: string, defaultValue: string): string | null {
        // IntelliJ의 Messages.showInputDialog() 사용
        return defaultValue; // 임시
    }

    private showInfoMessage(message: string): void {
        // IntelliJ의 Notifications.Bus.notify() 사용
        console.log(message);
    }

    private analyzeProjectStructure(project: Project): any {
        // 프로젝트 구조 분석
        return {};
    }

    private createCrudFiles(project: Project, entityName: string, structure: any): void {
        // 파일 생성 로직
    }

    private createFile(project: Project, fileName: string, content: string): void {
        // 파일 생성 로직
    }

    private findCrudControllers(project: Project): any[] {
        // CRUD 컨트롤러 찾기
        return [];
    }

    private performPerformanceAnalysis(controllers: any[]): any {
        // 성능 분석 수행
        return {};
    }

    private showAnalysisResults(results: any): void {
        // 분석 결과 표시
    }

    private generateApiDocumentation(controllers: any[]): string {
        // API 문서 생성
        return '';
    }

    private generateCrudDecorator(): string {
        return '@Crud({\n  model: { type: Entity },\n})';
    }

    private addDecoratorToClass(classElement: PsiElement, decorator: string): void {
        // 클래스에 데코레이터 추가
    }

    private addImports(file: PsiFile, imports: string[]): void {
        // 임포트 추가
    }

    private getClassProperties(classElement: PsiElement): any[] {
        // 클래스 프로퍼티 조회
        return [];
    }

    private suggestValidators(property: any): string[] {
        // 유효성 검사기 제안
        return [];
    }

    private addValidatorsToProperty(property: any, validators: string[]): void {
        // 프로퍼티에 유효성 검사기 추가
    }

    private getEntityProperties(entityElement: PsiElement): any[] {
        // 엔티티 프로퍼티 조회
        return [];
    }

    private generateCreateDtoFromProperties(entityName: string, properties: any[]): string {
        // 프로퍼티로부터 Create DTO 생성
        return '';
    }

    private generateUpdateDtoFromProperties(entityName: string, properties: any[]): string {
        // 프로퍼티로부터 Update DTO 생성
        return '';
    }

    private parseCrudConfiguration(decoratorElement: PsiElement): any {
        // CRUD 설정 파싱
        return {};
    }

    private generateRoutesConfiguration(): any {
        // 라우트 설정 생성
        return {};
    }

    private updateCrudConfiguration(decoratorElement: PsiElement, config: any): void {
        // CRUD 설정 업데이트
    }
}

/**
 * 코드 검사 베이스 클래스
 */
abstract class CrudInspection {
    abstract name: string;
    abstract description: string;
    abstract severity: 'ERROR' | 'WARNING' | 'INFO';

    abstract inspect(element: PsiElement): InspectionResult[];
}

interface InspectionResult {
    message: string;
    range: TextRange;
    quickFixes: QuickFix[];
}

interface TextRange {
    startOffset: number;
    endOffset: number;
}

interface QuickFix {
    name: string;
    apply: (element: PsiElement) => void;
}

/**
 * CRUD 데코레이터 누락 검사
 */
class MissingCrudDecoratorInspection extends CrudInspection {
    name = 'Missing @Crud decorator';
    description = 'Controller class should have @Crud decorator for CRUD functionality';
    severity: 'WARNING' = 'WARNING';

    inspect(element: PsiElement): InspectionResult[] {
        // 검사 로직 구현
        return [];
    }
}

/**
 * 잘못된 CRUD 설정 검사
 */
class InvalidCrudConfigurationInspection extends CrudInspection {
    name = 'Invalid CRUD configuration';
    description = 'CRUD decorator configuration is invalid';
    severity: 'ERROR' = 'ERROR';

    inspect(element: PsiElement): InspectionResult[] {
        // 검사 로직 구현
        return [];
    }
}

/**
 * 유효성 검사 누락 검사
 */
class MissingValidationInspection extends CrudInspection {
    name = 'Missing validation decorators';
    description = 'DTO properties should have validation decorators';
    severity: 'WARNING' = 'WARNING';

    inspect(element: PsiElement): InspectionResult[] {
        // 검사 로직 구현
        return [];
    }
}

/**
 * 성능 이슈 검사
 */
class PerformanceIssueInspection extends CrudInspection {
    name = 'Performance issue detected';
    description = 'Potential performance issues in CRUD operations';
    severity: 'WARNING' = 'WARNING';

    inspect(element: PsiElement): InspectionResult[] {
        // 검사 로직 구현
        return [];
    }
}

/**
 * 보안 이슈 검사
 */
class SecurityIssueInspection extends CrudInspection {
    name = 'Security vulnerability';
    description = 'Potential security vulnerabilities in CRUD operations';
    severity: 'ERROR' = 'ERROR';

    inspect(element: PsiElement): InspectionResult[] {
        // 검사 로직 구현
        return [];
    }
}