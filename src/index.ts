export * from './lib/abstract';
export * from './lib/crud.decorator';
export * from './lib/crud.policy';
export * from './lib/crud.route.factory';
export * from './lib/crud.service';
export * from './lib/dto';
export * from './lib/interceptor';
export * from './lib/interface';
export * from './lib/provider';
export * from './lib/request';
export * from './lib/utils/response-factory';
export * from './lib/utils/batch-processor';
export * from './lib/utils/crud-query-helper';
export * from './lib/utils/crud-operation-helper';
export * from './lib/utils/crud-conditional-helper';
export * from './lib/utils/crud-query-builder';
export * from './lib/utils/type-safe-query-builder';
export * from './lib/utils/auto-relation-detector';
export * from './lib/utils/crud-cache-helper';
export * from './lib/utils/smart-batch-processor';
export * from './lib/utils/progress-tracker';
export * from './lib/utils/change-detector';
export * from './lib/utils/conditional-field-processor';
export * from './lib/utils/lazy-relation-loader';
export * from './lib/utils/response-transformer';
export * from './lib/utils/query-performance-analyzer';
export * from './lib/utils/index-suggestion-engine';
export * from './lib/utils/multi-tier-cache';
export * from './lib/utils/debug-tools';
export * from './lib/utils/test-generator';

// ============================================
// 🛠️ CLI 도구들
// ============================================
export * from './lib/cli';

// ============================================
// 🔧 IDE 확장 기능들
// ============================================
export * from './lib/ide/vscode-extension';
export * from './lib/ide/intellij-plugin';

// ============================================
// 🎯 체이닝 가능한 설정 데코레이터들
// ============================================
export * from './lib/decorator/chaining.decorator';
export * from './lib/decorator/conditional.decorator';

// ============================================
// 🎯 라이프사이클 훅 데코레이터들
// ============================================
export * from './lib/capitalize-first-letter';
export * from './lib/constants';
export {
    AfterAssign,
    AfterAssignCreate,
    AfterAssignUpdate,
    AfterAssignUpsert,
    AfterAssignShow,
    AfterCreate,
    AfterDestroy,
    AfterRecover,
    AfterSave,
    AfterSaveCreate,
    AfterSaveUpdate,
    AfterSaveUpsert,
    AfterShow,
    AfterUpdate,
    AfterUpsert,

    // === 일관성 있는 세밀한 제어용 데코레이터들 ===
    BeforeAssign,
    // === 🆕 새로운 4단계 세분화 데코레이터들 ===
    BeforeAssignCreate,
    BeforeAssignUpdate,
    BeforeAssignUpsert,
    BeforeAssignShow,
    // === 기존 데코레이터들 (계속 사용 가능) ===
    BeforeCreate,
    BeforeDestroy,
    BeforeRecover,
    BeforeSave,
    BeforeSaveCreate,
    BeforeSaveUpdate,
    BeforeSaveUpsert,
    BeforeShow,
    BeforeUpdate,
    BeforeUpsert,
} from './lib/dto/lifecycle-hooks.decorator';
