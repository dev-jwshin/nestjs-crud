/**
 * TypeORM Column 타입을 class-validator 검증 규칙으로 자동 매핑하는 시스템
 * allowedParams에 포함된 필드가 검증 데코레이터 없어도 자동으로 검증되도록 지원
 */

// ValidationRule에 사용할 options는 any 타입으로 처리 (class-validator 옵션이 다양함)
import type { ColumnMetadataArgs } from 'typeorm/metadata-args/ColumnMetadataArgs';

// 🎯 TypeORM 컬럼 타입별 기본 검증 규칙 매핑
export const COLUMN_TYPE_VALIDATOR_MAP: Record<string, ValidationRule[]> = {
    // === 문자열 타입들 ===
    varchar: [{ validator: 'isString', options: {} }],
    char: [{ validator: 'isString', options: {} }],
    text: [{ validator: 'isString', options: {} }],
    longtext: [{ validator: 'isString', options: {} }],
    mediumtext: [{ validator: 'isString', options: {} }],
    tinytext: [{ validator: 'isString', options: {} }],

    // === 숫자 타입들 ===
    int: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    integer: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    tinyint: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    smallint: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    mediumint: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    bigint: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    float: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    double: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    decimal: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],
    numeric: [{ validator: 'isNumber', options: { allowNaN: false, allowInfinity: false } }],

    // === Boolean 타입 ===
    boolean: [{ validator: 'isBoolean', options: {} }],
    bool: [{ validator: 'isBoolean', options: {} }],

    // === 날짜 타입들 ===
    timestamp: [{ validator: 'isDateString', options: {} }],
    datetime: [{ validator: 'isDateString', options: {} }],
    date: [{ validator: 'isDateString', options: {} }],
    time: [{ validator: 'isDateString', options: {} }],

    // === JSON/Object 타입 ===
    json: [{ validator: 'isObject', options: {} }],
    jsonb: [{ validator: 'isObject', options: {} }],

    // === UUID 타입 ===
    uuid: [{ validator: 'isUUID', options: {} }],

    // === 이메일 특수 처리 (컬럼명 기반) ===
    email: [
        { validator: 'isString', options: {} },
        { validator: 'isEmail', options: {} },
    ],

    // === Enum 타입 (동적 처리 필요) ===
    enum: [{ validator: 'isString', options: {} }], // 기본값, 런타임에서 enum 값으로 교체
};

// 🎯 컬럼명 기반 특수 검증 규칙 (이메일, 전화번호 등)
export const COLUMN_NAME_VALIDATOR_MAP: Record<string, ValidationRule[]> = {
    email: [
        { validator: 'isString', options: {} },
        { validator: 'isEmail', options: {} },
    ],
    phone: [
        { validator: 'isString', options: {} },
        { validator: 'isMobilePhone', options: { locale: 'ko-KR' } },
    ],
    url: [
        { validator: 'isString', options: {} },
        { validator: 'isUrl', options: {} },
    ],
    password: [
        { validator: 'isString', options: {} },
        { validator: 'minLength', options: { value: 8 } },
    ],
};

// 🎯 검증 규칙 인터페이스
export interface ValidationRule {
    validator: string;
    options: any; // class-validator의 다양한 옵션을 수용하기 위해 any 사용
    message?: string;
}

// 🎯 동적 검증 메타데이터 인터페이스
export interface DynamicValidationMetadata {
    propertyName: string;
    rules: ValidationRule[];
    isOptional: boolean;
    target: any;
}

/**
 * 🔧 TypeORM Column 메타데이터에서 검증 규칙을 자동 생성
 * @param columnMeta TypeORM Column 메타데이터
 * @returns 검증 규칙 배열
 */
export function generateValidationRulesFromColumn(columnMeta: ColumnMetadataArgs): ValidationRule[] {
    const rules: ValidationRule[] = [];

    // 1. 컬럼 타입 기반 기본 검증 규칙
    const columnType = String(columnMeta.options?.type || 'varchar').toLowerCase();
    const typeRules = COLUMN_TYPE_VALIDATOR_MAP[columnType];

    if (typeRules) {
        rules.push(...typeRules);
    }

    // 2. 컬럼명 기반 특수 검증 규칙 (우선순위 높음)
    const columnName = columnMeta.propertyName.toLowerCase();
    const nameRules = COLUMN_NAME_VALIDATOR_MAP[columnName];

    if (nameRules) {
        // 컬럼명 기반 규칙이 있으면 타입 기반 규칙을 덮어씀
        return nameRules;
    }

    // 3. Enum 타입 특수 처리
    if (columnType === 'enum' && columnMeta.options?.enum) {
        const enumValues = Array.isArray(columnMeta.options.enum) ? columnMeta.options.enum : Object.values(columnMeta.options.enum);

        rules.push({
            validator: 'isIn',
            options: { values: enumValues },
            message: `${columnMeta.propertyName} must be one of: ${enumValues.join(', ')}`,
        });
    }

    // 4. 길이 제한 추가 (varchar, char)
    if (['varchar', 'char'].includes(columnType) && columnMeta.options?.length) {
        rules.push({
            validator: 'maxLength',
            options: { value: columnMeta.options.length },
            message: `${columnMeta.propertyName} must not exceed ${columnMeta.options.length} characters`,
        });
    }

    return rules;
}

/**
 * 🔧 컬럼이 선택적(Optional)인지 판단
 * @param columnMeta TypeORM Column 메타데이터
 * @returns true if optional (nullable or has default value)
 */
export function isColumnOptional(columnMeta: ColumnMetadataArgs): boolean {
    const options = columnMeta.options || {};

    // nullable: true 이거나 default 값이 있으면 선택적
    return Boolean(options.nullable || options.default !== undefined);
}

/**
 * 🎯 allowedParams에 포함된 컬럼인지 확인
 * @param propertyName 프로퍼티명
 * @param allowedParams 허용된 파라미터 목록
 * @returns true if allowed
 */
export function isAllowedParam(propertyName: string, allowedParams?: string[]): boolean {
    if (!allowedParams || allowedParams.length === 0) {
        return false; // allowedParams가 없으면 기본적으로 차단
    }

    return allowedParams.includes(propertyName);
}

/**
 * 🔧 디버깅용 검증 규칙 출력
 * @param metadata 동적 검증 메타데이터
 */
export function debugValidationMetadata(metadata: DynamicValidationMetadata[]): void {
    console.log('🔍 Dynamic Validation Metadata:');
    metadata.forEach((meta, index) => {
        console.log(`${index + 1}. ${meta.propertyName} (optional: ${meta.isOptional})`);
        meta.rules.forEach((rule, ruleIndex) => {
            console.log(`   ${ruleIndex + 1}) @${rule.validator}(${JSON.stringify(rule.options)})`);
        });
    });
}
