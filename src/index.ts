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
    AfterCreate,
    AfterSave,
    AfterSaveCreate,
    AfterSaveUpdate,
    AfterSaveUpsert,
    AfterUpdate,
    AfterUpsert,

    // === 일관성 있는 세밀한 제어용 데코레이터들 ===
    BeforeAssign,
    // === 🆕 새로운 4단계 세분화 데코레이터들 ===
    BeforeAssignCreate,
    BeforeAssignUpdate,
    BeforeAssignUpsert,
    // === 기존 데코레이터들 (계속 사용 가능) ===
    BeforeCreate,
    BeforeSave,
    BeforeSaveCreate,
    BeforeSaveUpdate,
    BeforeSaveUpsert,
    BeforeUpdate,
    BeforeUpsert,
} from './lib/dto/lifecycle-hooks.decorator';
