
import type { ContextType, ExecutionContext, Type } from '@nestjs/common';
import type { HttpArgumentsHost, RpcArgumentsHost, WsArgumentsHost } from '@nestjs/common/interfaces';

/**
 * util class to mocking ExecutionContext
 */
export class ExecutionContextHostMock implements ExecutionContext {
    private contextType: string = 'http';

    constructor(
        private readonly args: unknown[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private readonly constructorRef?: Type<any>,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        private readonly handler?: Function,
    ) {}

    setType<TContext extends string = ContextType>(type: TContext): void {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        type && (this.contextType = type);
    }

    getType<TContext extends string = ContextType>(): TContext {
        return this.contextType as TContext;
    }

    getClass<T = unknown>(): Type<T> {
        return this.constructorRef!;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    getHandler(): Function {
        return this.handler!;
    }

    getArgs<T extends unknown[] = unknown[]>(): T {
        return this.args as T;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getArgByIndex<T = any>(index: number): T {
        return this.args[index] as T;
    }

    switchToRpc(): RpcArgumentsHost {
        return Object.assign(this, {
            getData: () => this.getArgByIndex(0),
            getContext: () => this.getArgByIndex(1),
        });
    }

    switchToHttp(): HttpArgumentsHost {
        return Object.assign(this, {
            getRequest: () => this.getArgByIndex(0),
            getResponse: () => this.getArgByIndex(1),
            getNext: () => this.getArgByIndex(2),
        });
    }

    switchToWs(): WsArgumentsHost {
        return Object.assign(this, {
            getClient: () => this.getArgByIndex(0),
            getData: () => this.getArgByIndex(1),
            getPattern: () => this.getArgByIndex(2),
        });
    }
}
