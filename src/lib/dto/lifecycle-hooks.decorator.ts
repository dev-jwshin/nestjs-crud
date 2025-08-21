// 생명주기 훅 메타데이터 키
export const LIFECYCLE_HOOKS_METADATA = 'LIFECYCLE_HOOKS_METADATA';

// Hook types using const assertion for better type safety and maintainability
export const HOOK_TYPES = {
    ASSIGN_BEFORE: 'assignBefore',
    ASSIGN_AFTER: 'assignAfter',
    SAVE_BEFORE: 'saveBefore',
    SAVE_AFTER: 'saveAfter',
    DESTROY_BEFORE: 'destroyBefore',
    DESTROY_AFTER: 'destroyAfter',
    RECOVER_BEFORE: 'recoverBefore',
    RECOVER_AFTER: 'recoverAfter'
} as const;

export type HookType = typeof HOOK_TYPES[keyof typeof HOOK_TYPES];
export type MethodType = 'create' | 'update' | 'upsert' | 'destroy' | 'recover' | 'show';

// 훅 메타데이터 인터페이스
export interface LifecycleHookMetadata {
    hookType: HookType;
    methodType: MethodType;
    methodName: string;
}

// 메타데이터 저장 헬퍼
function createLifecycleHook(hookType: HookType, methodType: MethodType) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        const existingHooks: LifecycleHookMetadata[] = Reflect.getMetadata(LIFECYCLE_HOOKS_METADATA, target) || [];

        const hookMetadata: LifecycleHookMetadata = {
            hookType,
            methodType,
            methodName: propertyKey,
        };

        existingHooks.push(hookMetadata);
        Reflect.defineMetadata(LIFECYCLE_HOOKS_METADATA, existingHooks, target);

        return descriptor;
    };
}

// CREATE 관련 데코레이터
export const BeforeCreate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'create');
export const AfterCreate = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'create');

// UPDATE 관련 데코레이터
export const BeforeUpdate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'update');
export const AfterUpdate = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'update');

// UPSERT 관련 데코레이터
export const BeforeUpsert = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'upsert');
export const AfterUpsert = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'upsert');

// DESTROY 관련 데코레이터
export const BeforeDestroy = () => createLifecycleHook(HOOK_TYPES.DESTROY_BEFORE, 'destroy');
export const AfterDestroy = () => createLifecycleHook(HOOK_TYPES.DESTROY_AFTER, 'destroy');

// RECOVER 관련 데코레이터
export const BeforeRecover = () => createLifecycleHook(HOOK_TYPES.RECOVER_BEFORE, 'recover');
export const AfterRecover = () => createLifecycleHook(HOOK_TYPES.RECOVER_AFTER, 'recover');

// SHOW 관련 데코레이터
export const BeforeShow = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'show');
export const AfterShow = () => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, 'show');

// 더 세밀한 제어를 위한 데코레이터들
export const BeforeAssign = (method: MethodType) => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, method);
export const AfterAssign = (method: MethodType) => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, method);
export const BeforeSave = (method: MethodType) => createLifecycleHook(HOOK_TYPES.SAVE_BEFORE, method);
export const AfterSave = (method: MethodType) => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, method);

// 새로운 세분화된 데코레이터들 (4개 단계별로 명확하게)
// === BEFORE ASSIGN 단계 (엔티티에 데이터 할당 전) ===
export const BeforeAssignCreate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'create');
export const BeforeAssignUpdate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'update');
export const BeforeAssignUpsert = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'upsert');
export const BeforeAssignShow = () => createLifecycleHook(HOOK_TYPES.ASSIGN_BEFORE, 'show');

// === AFTER ASSIGN 단계 (엔티티에 데이터 할당 후) ===
export const AfterAssignCreate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, 'create');
export const AfterAssignUpdate = () => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, 'update');
export const AfterAssignUpsert = () => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, 'upsert');
export const AfterAssignShow = () => createLifecycleHook(HOOK_TYPES.ASSIGN_AFTER, 'show');

// === BEFORE SAVE 단계 (데이터베이스 저장 전) ===
export const BeforeSaveCreate = () => createLifecycleHook(HOOK_TYPES.SAVE_BEFORE, 'create');
export const BeforeSaveUpdate = () => createLifecycleHook(HOOK_TYPES.SAVE_BEFORE, 'update');
export const BeforeSaveUpsert = () => createLifecycleHook(HOOK_TYPES.SAVE_BEFORE, 'upsert');

// === AFTER SAVE 단계 (데이터베이스 저장 후) ===
export const AfterSaveCreate = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'create');
export const AfterSaveUpdate = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'update');
export const AfterSaveUpsert = () => createLifecycleHook(HOOK_TYPES.SAVE_AFTER, 'upsert');

// === DESTROY 단계 (엔티티 삭제 전후) ===
export const BeforeDestroyDestroy = () => createLifecycleHook(HOOK_TYPES.DESTROY_BEFORE, 'destroy');
export const AfterDestroyDestroy = () => createLifecycleHook(HOOK_TYPES.DESTROY_AFTER, 'destroy');

// === RECOVER 단계 (엔티티 복구 전후) ===
export const BeforeRecoverRecover = () => createLifecycleHook(HOOK_TYPES.RECOVER_BEFORE, 'recover');
export const AfterRecoverRecover = () => createLifecycleHook(HOOK_TYPES.RECOVER_AFTER, 'recover');

// 훅 메타데이터 읽기 헬퍼
export function getLifecycleHooks(target: any): LifecycleHookMetadata[] {
    return Reflect.getMetadata(LIFECYCLE_HOOKS_METADATA, target) || [];
}
