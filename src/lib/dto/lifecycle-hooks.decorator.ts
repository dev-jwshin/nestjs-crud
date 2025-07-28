import { SetMetadata } from '@nestjs/common';

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
export const AssignBefore = (method: MethodType) => createLifecycleHook('assignBefore', method);
export const AssignAfter = (method: MethodType) => createLifecycleHook('assignAfter', method);
export const SaveBefore = (method: MethodType) => createLifecycleHook('saveBefore', method);
export const SaveAfter = (method: MethodType) => createLifecycleHook('saveAfter', method);

// 훅 메타데이터 읽기 헬퍼
export function getLifecycleHooks(target: any): LifecycleHookMetadata[] {
  return Reflect.getMetadata(LIFECYCLE_HOOKS_METADATA, target) || [];
} 