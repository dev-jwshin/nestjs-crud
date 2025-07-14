export enum Method {
    SHOW = 'show',
    INDEX = 'index',
    CREATE = 'create',
    UPDATE = 'update',
    DESTROY = 'destroy',
    UPSERT = 'upsert',
    RECOVER = 'recover',
}

export const GROUP = { ...Method, PARAMS: 'params' as const };
