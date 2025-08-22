/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import * as http from 'http';
import * as path from 'path';

export interface DocumentationOptions {
    inputPath: string;
    outputPath: string;
    format: 'html' | 'markdown' | 'json';
    includeExamples?: boolean;
    includeTests?: boolean;
    theme?: string;
    title?: string;
    port?: number;
}

export interface ApiEndpoint {
    method: string;
    path: string;
    description: string;
    parameters: Parameter[];
    responses: Response[];
    examples: Example[];
}

export interface Parameter {
    name: string;
    type: string;
    required: boolean;
    description: string;
    example?: any;
}

export interface Response {
    status: number;
    description: string;
    schema?: any;
    example?: any;
}

export interface Example {
    title: string;
    description: string;
    request: any;
    response: any;
}

export interface DocumentationResult {
    endpoints: ApiEndpoint[];
    models: ModelDefinition[];
    metadata: DocumentationMetadata;
}

export interface ModelDefinition {
    name: string;
    description: string;
    properties: PropertyDefinition[];
}

export interface PropertyDefinition {
    name: string;
    type: string;
    required: boolean;
    description: string;
    example?: any;
    validation?: DocumentationValidationRule[];
}

export interface DocumentationValidationRule {
    type: string;
    value?: any;
    message?: string;
}

export interface DocumentationMetadata {
    title: string;
    version: string;
    description: string;
    generatedAt: Date;
    totalEndpoints: number;
    totalModels: number;
}

/**
 * 자동 문서화 생성기
 */
export class DocumentationGenerator {
    private parsers = new Map<string, FileParser>();

    constructor() {
        this.initializeParsers();
    }

    /**
     * 문서 생성
     */
    async generateDocs(args: string[]): Promise<void> {
        const options = this.parseDocsArgs(args);
        
        console.log(`📚 Generating documentation...`);
        console.log(`📁 Input: ${options.inputPath}`);
        console.log(`📁 Output: ${options.outputPath}`);
        console.log(`📄 Format: ${options.format}`);

        try {
            // 소스 코드 분석
            const result = await this.analyzeProject(options);
            
            // 문서 생성
            await this.generateDocumentation(result, options);
            
            console.log(`✅ Documentation generated successfully!`);
            console.log(`📊 ${result.metadata.totalEndpoints} endpoints documented`);
            console.log(`🏗️  ${result.metadata.totalModels} models documented`);
            
        } catch (error) {
            console.error(`❌ Error generating documentation: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * 문서 서버 실행
     */
    async serveDocs(args: string[]): Promise<void> {
        const options = this.parseDocsArgs(args);
        const port = options.port || 3001;
        
        console.log(`🌐 Starting documentation server...`);
        
        // 문서가 없으면 생성
        if (!existsSync(options.outputPath)) {
            console.log(`📚 Generating documentation first...`);
            await this.generateDocs([
                '--input', options.inputPath,
                '--output', options.outputPath,
                '--format', 'html'
            ]);
        }

        const server = http.createServer((req, res) => {
            this.handleRequest(req, res, options.outputPath);
        });

        server.listen(port, () => {
            console.log(`🚀 Documentation server running at http://localhost:${port}`);
            console.log(`📁 Serving from: ${options.outputPath}`);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down documentation server...');
            server.close(() => {
                console.log('👋 Server stopped');
                process.exit(0);
            });
        });
    }

    /**
     * 프로젝트 분석
     */
    private async analyzeProject(options: DocumentationOptions): Promise<DocumentationResult> {
        const result: DocumentationResult = {
            endpoints: [],
            models: [],
            metadata: {
                title: options.title || 'API Documentation',
                version: '1.0.0',
                description: 'Auto-generated API documentation',
                generatedAt: new Date(),
                totalEndpoints: 0,
                totalModels: 0
            }
        };

        try {
            // 컨트롤러 파일 스캔
            const controllerFiles = this.findFiles(options.inputPath, '.controller.ts');
            for (const file of controllerFiles) {
                const endpoints = await this.parseControllerFile(file);
                result.endpoints.push(...endpoints);
            }

            // 엔티티 파일 스캔
            const entityFiles = this.findFiles(options.inputPath, '.entity.ts');
            for (const file of entityFiles) {
                const models = await this.parseEntityFile(file);
                result.models.push(...models);
            }

            // DTO 파일 스캔
            const dtoFiles = this.findFiles(options.inputPath, '.dto.ts');
            for (const file of dtoFiles) {
                const models = await this.parseDtoFile(file);
                result.models.push(...models);
            }

            result.metadata.totalEndpoints = result.endpoints.length;
            result.metadata.totalModels = result.models.length;

            return result;
            
        } catch (error) {
            throw new Error(`Failed to analyze project: ${(error as Error).message}`);
        }
    }

    /**
     * 문서 생성
     */
    private async generateDocumentation(
        result: DocumentationResult,
        options: DocumentationOptions
    ): Promise<void> {
        if (!existsSync(options.outputPath)) {
            mkdirSync(options.outputPath, { recursive: true });
        }

        switch (options.format) {
            case 'html':
                await this.generateHtmlDocs(result, options);
                break;
            case 'markdown':
                await this.generateMarkdownDocs(result, options);
                break;
            case 'json':
                await this.generateJsonDocs(result, options);
                break;
            default:
                throw new Error(`Unsupported format: ${options.format}`);
        }
    }

    /**
     * HTML 문서 생성
     */
    private async generateHtmlDocs(
        result: DocumentationResult,
        options: DocumentationOptions
    ): Promise<void> {
        // 메인 페이지
        const indexHtml = this.generateIndexHtml(result, options);
        writeFileSync(join(options.outputPath, 'index.html'), indexHtml, 'utf8');

        // API 엔드포인트 페이지
        const apiHtml = this.generateApiHtml(result, options);
        writeFileSync(join(options.outputPath, 'api.html'), apiHtml, 'utf8');

        // 모델 페이지
        const modelsHtml = this.generateModelsHtml(result, options);
        writeFileSync(join(options.outputPath, 'models.html'), modelsHtml, 'utf8');

        // CSS 스타일
        const cssContent = this.generateCss(options.theme);
        writeFileSync(join(options.outputPath, 'styles.css'), cssContent, 'utf8');

        // JavaScript
        const jsContent = this.generateJavaScript();
        writeFileSync(join(options.outputPath, 'script.js'), jsContent, 'utf8');
    }

    /**
     * Markdown 문서 생성
     */
    private async generateMarkdownDocs(
        result: DocumentationResult,
        options: DocumentationOptions
    ): Promise<void> {
        // README
        const readmeContent = this.generateReadmeMd(result, options);
        writeFileSync(join(options.outputPath, 'README.md'), readmeContent, 'utf8');

        // API 문서
        const apiContent = this.generateApiMd(result, options);
        writeFileSync(join(options.outputPath, 'API.md'), apiContent, 'utf8');

        // 모델 문서
        const modelsContent = this.generateModelsMd(result, options);
        writeFileSync(join(options.outputPath, 'MODELS.md'), modelsContent, 'utf8');
    }

    /**
     * JSON 문서 생성
     */
    private async generateJsonDocs(
        result: DocumentationResult,
        options: DocumentationOptions
    ): Promise<void> {
        // OpenAPI 스펙 생성
        const openApiSpec = this.generateOpenApiSpec(result, options);
        writeFileSync(
            join(options.outputPath, 'openapi.json'),
            JSON.stringify(openApiSpec, null, 2),
            'utf8'
        );

        // 전체 결과 JSON
        writeFileSync(
            join(options.outputPath, 'documentation.json'),
            JSON.stringify(result, null, 2),
            'utf8'
        );
    }

    /**
     * 컨트롤러 파일 파싱
     */
    private async parseControllerFile(filePath: string): Promise<ApiEndpoint[]> {
        const content = readFileSync(filePath, 'utf8');
        const parser = this.parsers.get('controller');
        
        if (!parser) {
            throw new Error('Controller parser not found');
        }

        return parser.parse(content, filePath);
    }

    /**
     * 엔티티 파일 파싱
     */
    private async parseEntityFile(filePath: string): Promise<ModelDefinition[]> {
        const content = readFileSync(filePath, 'utf8');
        const parser = this.parsers.get('entity');
        
        if (!parser) {
            throw new Error('Entity parser not found');
        }

        return parser.parse(content, filePath);
    }

    /**
     * DTO 파일 파싱
     */
    private async parseDtoFile(filePath: string): Promise<ModelDefinition[]> {
        const content = readFileSync(filePath, 'utf8');
        const parser = this.parsers.get('dto');
        
        if (!parser) {
            throw new Error('DTO parser not found');
        }

        return parser.parse(content, filePath);
    }

    /**
     * 파일 찾기
     */
    private findFiles(dir: string, extension: string): string[] {
        const files: string[] = [];
        
        if (!existsSync(dir)) {
            return files;
        }

        const entries = readdirSync(dir);
        
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.findFiles(fullPath, extension));
            } else if (entry.endsWith(extension)) {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    /**
     * HTTP 요청 처리
     */
    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse, docPath: string): void {
        let filePath = req.url === '/' ? '/index.html' : req.url || '';
        filePath = join(docPath, filePath);

        if (!existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = extname(filePath);
        const contentType = this.getContentType(ext);
        
        const content = readFileSync(filePath);
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    }

    /**
     * Content-Type 반환
     */
    private getContentType(ext: string): string {
        switch (ext) {
            case '.html': return 'text/html';
            case '.css': return 'text/css';
            case '.js': return 'application/javascript';
            case '.json': return 'application/json';
            default: return 'text/plain';
        }
    }

    /**
     * 파서 초기화
     */
    private initializeParsers(): void {
        this.parsers.set('controller', new ControllerParser());
        this.parsers.set('entity', new EntityParser());
        this.parsers.set('dto', new DtoParser());
    }

    /**
     * 메인 HTML 생성
     */
    private generateIndexHtml(result: DocumentationResult, options: DocumentationOptions): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${result.metadata.title}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <nav class="navbar">
        <div class="nav-brand">${result.metadata.title}</div>
        <div class="nav-links">
            <a href="index.html">Home</a>
            <a href="api.html">API</a>
            <a href="models.html">Models</a>
        </div>
    </nav>
    
    <main class="container">
        <h1>${result.metadata.title}</h1>
        <p>${result.metadata.description}</p>
        
        <div class="stats">
            <div class="stat-card">
                <h3>${result.metadata.totalEndpoints}</h3>
                <p>API Endpoints</p>
            </div>
            <div class="stat-card">
                <h3>${result.metadata.totalModels}</h3>
                <p>Data Models</p>
            </div>
        </div>
        
        <h2>Getting Started</h2>
        <p>This documentation was automatically generated from your NestJS CRUD application.</p>
        
        <h3>Base URL</h3>
        <code>http://localhost:3000</code>
        
        <h3>Authentication</h3>
        <p>Include your API key in the Authorization header:</p>
        <pre><code>Authorization: Bearer your-api-key</code></pre>
    </main>
    
    <script src="script.js"></script>
</body>
</html>
        `.trim();
    }

    /**
     * API HTML 생성
     */
    private generateApiHtml(result: DocumentationResult, options: DocumentationOptions): string {
        const endpointsHtml = result.endpoints.map(endpoint => `
            <div class="endpoint">
                <div class="endpoint-header">
                    <span class="method method-${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                    <span class="path">${endpoint.path}</span>
                </div>
                <div class="endpoint-body">
                    <p>${endpoint.description}</p>
                    ${this.generateParametersHtml(endpoint.parameters)}
                    ${this.generateResponsesHtml(endpoint.responses)}
                    ${this.generateExamplesHtml(endpoint.examples)}
                </div>
            </div>
        `).join('');

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API - ${result.metadata.title}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <nav class="navbar">
        <div class="nav-brand">${result.metadata.title}</div>
        <div class="nav-links">
            <a href="index.html">Home</a>
            <a href="api.html" class="active">API</a>
            <a href="models.html">Models</a>
        </div>
    </nav>
    
    <main class="container">
        <h1>API Endpoints</h1>
        <div class="endpoints">
            ${endpointsHtml}
        </div>
    </main>
    
    <script src="script.js"></script>
</body>
</html>
        `.trim();
    }

    /**
     * 파라미터 HTML 생성
     */
    private generateParametersHtml(parameters: Parameter[]): string {
        if (parameters.length === 0) return '';

        const paramsHtml = parameters.map(param => `
            <tr>
                <td><code>${param.name}</code></td>
                <td><span class="type">${param.type}</span></td>
                <td><span class="required-${param.required}">${param.required ? 'Yes' : 'No'}</span></td>
                <td>${param.description}</td>
            </tr>
        `).join('');

        return `
            <h4>Parameters</h4>
            <table class="params-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Required</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${paramsHtml}
                </tbody>
            </table>
        `;
    }

    /**
     * 응답 HTML 생성
     */
    private generateResponsesHtml(responses: Response[]): string {
        if (responses.length === 0) return '';

        const responsesHtml = responses.map(response => `
            <div class="response">
                <div class="response-status">
                    <span class="status-${Math.floor(response.status / 100)}xx">${response.status}</span>
                    <span>${response.description}</span>
                </div>
                ${response.example ? `<pre><code>${JSON.stringify(response.example, null, 2)}</code></pre>` : ''}
            </div>
        `).join('');

        return `
            <h4>Responses</h4>
            <div class="responses">
                ${responsesHtml}
            </div>
        `;
    }

    /**
     * 예시 HTML 생성
     */
    private generateExamplesHtml(examples: Example[]): string {
        if (examples.length === 0) return '';

        const examplesHtml = examples.map(example => `
            <div class="example">
                <h5>${example.title}</h5>
                <p>${example.description}</p>
                <div class="example-code">
                    <h6>Request</h6>
                    <pre><code>${JSON.stringify(example.request, null, 2)}</code></pre>
                    <h6>Response</h6>
                    <pre><code>${JSON.stringify(example.response, null, 2)}</code></pre>
                </div>
            </div>
        `).join('');

        return `
            <h4>Examples</h4>
            <div class="examples">
                ${examplesHtml}
            </div>
        `;
    }

    /**
     * 모델 HTML 생성
     */
    private generateModelsHtml(result: DocumentationResult, options: DocumentationOptions): string {
        // 모델 HTML 생성 로직
        return `<!DOCTYPE html><html><head><title>Models</title></head><body><h1>Models</h1></body></html>`;
    }

    /**
     * CSS 생성
     */
    private generateCss(theme?: string): string {
        return `
body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
.navbar { background: #2c3e50; color: white; padding: 1rem; display: flex; justify-content: space-between; }
.nav-brand { font-weight: bold; font-size: 1.2rem; }
.nav-links a { color: white; text-decoration: none; margin-left: 1rem; }
.nav-links a.active { border-bottom: 2px solid #3498db; }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.endpoint { background: white; margin: 1rem 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.endpoint-header { padding: 1rem; border-bottom: 1px solid #eee; display: flex; align-items: center; }
.method { padding: 0.25rem 0.5rem; border-radius: 4px; color: white; font-weight: bold; margin-right: 1rem; }
.method-get { background: #2ecc71; }
.method-post { background: #3498db; }
.method-put { background: #f39c12; }
.method-delete { background: #e74c3c; }
.path { font-family: monospace; font-size: 1.1rem; }
.endpoint-body { padding: 1rem; }
.params-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
.params-table th, .params-table td { padding: 0.5rem; border: 1px solid #ddd; text-align: left; }
.params-table th { background: #f8f9fa; }
.type { background: #e9ecef; padding: 0.25rem 0.5rem; border-radius: 4px; font-family: monospace; }
.required-true { color: #e74c3c; font-weight: bold; }
.required-false { color: #95a5a6; }
pre { background: #f8f9fa; padding: 1rem; border-radius: 4px; overflow-x: auto; }
code { font-family: monospace; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0; }
.stat-card { background: white; padding: 2rem; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.stat-card h3 { margin: 0; font-size: 2rem; color: #3498db; }
.stat-card p { margin: 0.5rem 0 0; color: #7f8c8d; }
        `.trim();
    }

    /**
     * JavaScript 생성
     */
    private generateJavaScript(): string {
        return `
document.addEventListener('DOMContentLoaded', function() {
    // 검색 기능
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            const endpoints = document.querySelectorAll('.endpoint');
            
            endpoints.forEach(endpoint => {
                const text = endpoint.textContent.toLowerCase();
                endpoint.style.display = text.includes(query) ? 'block' : 'none';
            });
        });
    }
    
    // 코드 복사 기능
    document.querySelectorAll('pre code').forEach(block => {
        const button = document.createElement('button');
        button.textContent = 'Copy';
        button.className = 'copy-btn';
        button.onclick = () => {
            navigator.clipboard.writeText(block.textContent);
            button.textContent = 'Copied!';
            setTimeout(() => button.textContent = 'Copy', 2000);
        };
        block.parentNode.appendChild(button);
    });
});
        `.trim();
    }

    /**
     * README Markdown 생성
     */
    private generateReadmeMd(result: DocumentationResult, options: DocumentationOptions): string {
        return `# ${result.metadata.title}

${result.metadata.description}

## Statistics

- **API Endpoints**: ${result.metadata.totalEndpoints}
- **Data Models**: ${result.metadata.totalModels}
- **Generated**: ${result.metadata.generatedAt.toISOString()}

## Getting Started

### Base URL
\`\`\`
http://localhost:3000
\`\`\`

### Authentication
Include your API key in the Authorization header:
\`\`\`
Authorization: Bearer your-api-key
\`\`\`

## Documentation

- [API Endpoints](./API.md)
- [Data Models](./MODELS.md)

---

*This documentation was automatically generated by NestJS CRUD CLI*
        `.trim();
    }

    /**
     * API Markdown 생성
     */
    private generateApiMd(result: DocumentationResult, options: DocumentationOptions): string {
        const endpointsMd = result.endpoints.map(endpoint => `
## ${endpoint.method} ${endpoint.path}

${endpoint.description}

### Parameters

${endpoint.parameters.length > 0 ? 
    `| Name | Type | Required | Description |
|------|------|----------|-------------|
${endpoint.parameters.map(p => `| ${p.name} | ${p.type} | ${p.required ? 'Yes' : 'No'} | ${p.description} |`).join('\n')}` 
    : 'No parameters'}

### Responses

${endpoint.responses.map(r => `
**${r.status}** - ${r.description}

${r.example ? '```json\n' + JSON.stringify(r.example, null, 2) + '\n```' : ''}
`).join('\n')}
        `).join('\n\n---\n\n');

        return `# API Endpoints

${endpointsMd}
        `.trim();
    }

    /**
     * 모델 Markdown 생성
     */
    private generateModelsMd(result: DocumentationResult, options: DocumentationOptions): string {
        return '# Data Models\n\n(Models documentation will be implemented)';
    }

    /**
     * OpenAPI 스펙 생성
     */
    private generateOpenApiSpec(result: DocumentationResult, options: DocumentationOptions): any {
        return {
            openapi: '3.0.0',
            info: {
                title: result.metadata.title,
                version: result.metadata.version,
                description: result.metadata.description
            },
            paths: {},
            components: {
                schemas: {}
            }
        };
    }

    /**
     * 명령행 인수 파싱
     */
    private parseDocsArgs(args: string[]): DocumentationOptions {
        const options: DocumentationOptions = {
            inputPath: './src',
            outputPath: './docs',
            format: 'html'
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '--input':
                case '-i':
                    options.inputPath = args[++i];
                    break;
                case '--output':
                case '-o':
                    options.outputPath = args[++i];
                    break;
                case '--format':
                case '-f':
                    options.format = args[++i] as any;
                    break;
                case '--title':
                    options.title = args[++i];
                    break;
                case '--port':
                case '-p':
                    options.port = parseInt(args[++i]);
                    break;
                case '--include-examples':
                    options.includeExamples = true;
                    break;
                case '--include-tests':
                    options.includeTests = true;
                    break;
                case '--theme':
                    options.theme = args[++i];
                    break;
            }
        }

        return options;
    }
}

/**
 * 파일 파서 베이스 클래스
 */
abstract class FileParser {
    abstract parse(content: string, filePath: string): any[];
}

/**
 * 컨트롤러 파서
 */
class ControllerParser extends FileParser {
    parse(content: string, filePath: string): ApiEndpoint[] {
        // TypeScript AST 파싱 및 @Crud 데코레이터 분석
        // 실제 구현에서는 typescript compiler API 사용
        return [];
    }
}

/**
 * 엔티티 파서
 */
class EntityParser extends FileParser {
    parse(content: string, filePath: string): ModelDefinition[] {
        // TypeORM 엔티티 분석
        return [];
    }
}

/**
 * DTO 파서
 */
class DtoParser extends FileParser {
    parse(content: string, filePath: string): ModelDefinition[] {
        // class-validator 데코레이터 분석
        return [];
    }
}