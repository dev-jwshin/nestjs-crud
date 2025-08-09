// 생명주기 훅 메타데이터 키
export const LIFECYCLE_HOOKS_METADATA = 'LIFECYCLE_HOOKS_METADATA';

// 훅 타입 정의
export type HookType = 'assignBefore' | 'assignAfter' | 'saveBefore' | 'saveAfter';
export type MethodType = 'create' | 'update' | 'upsert';

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
export const BeforeCreate = () => createLifecycleHook('assignBefore', 'create');
export const AfterCreate = () => createLifecycleHook('saveAfter', 'create');

// UPDATE 관련 데코레이터
export const BeforeUpdate = () => createLifecycleHook('assignBefore', 'update');
export const AfterUpdate = () => createLifecycleHook('saveAfter', 'update');

// UPSERT 관련 데코레이터
export const BeforeUpsert = () => createLifecycleHook('assignBefore', 'upsert');
export const AfterUpsert = () => createLifecycleHook('saveAfter', 'upsert');

// 더 세밀한 제어를 위한 데코레이터들
export const BeforeAssign = (method: MethodType) => createLifecycleHook('assignBefore', method);
export const AfterAssign = (method: MethodType) => createLifecycleHook('assignAfter', method);
export const BeforeSave = (method: MethodType) => createLifecycleHook('saveBefore', method);
export const AfterSave = (method: MethodType) => createLifecycleHook('saveAfter', method);

// 🆕 새로운 세분화된 데코레이터들 (4개 단계별로 명확하게)
// === BEFORE ASSIGN 단계 (엔티티에 데이터 할당 전) ===
export const BeforeAssignCreate = () => createLifecycleHook('assignBefore', 'create');
export const BeforeAssignUpdate = () => createLifecycleHook('assignBefore', 'update');
export const BeforeAssignUpsert = () => createLifecycleHook('assignBefore', 'upsert');

// === AFTER ASSIGN 단계 (엔티티에 데이터 할당 후) ===
export const AfterAssignCreate = () => createLifecycleHook('assignAfter', 'create');
export const AfterAssignUpdate = () => createLifecycleHook('assignAfter', 'update');
export const AfterAssignUpsert = () => createLifecycleHook('assignAfter', 'upsert');

// === BEFORE SAVE 단계 (데이터베이스 저장 전) ===
export const BeforeSaveCreate = () => createLifecycleHook('saveBefore', 'create');
export const BeforeSaveUpdate = () => createLifecycleHook('saveBefore', 'update');
export const BeforeSaveUpsert = () => createLifecycleHook('saveBefore', 'upsert');

// === AFTER SAVE 단계 (데이터베이스 저장 후) ===
export const AfterSaveCreate = () => createLifecycleHook('saveAfter', 'create');
export const AfterSaveUpdate = () => createLifecycleHook('saveAfter', 'update');
export const AfterSaveUpsert = () => createLifecycleHook('saveAfter', 'upsert');

// 훅 메타데이터 읽기 헬퍼
export function getLifecycleHooks(target: any): LifecycleHookMetadata[] {
    return Reflect.getMetadata(LIFECYCLE_HOOKS_METADATA, target) || [];
}
