import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import type { Request } from 'express';
import { CRUD_OPTIONS_METADATA } from '../constants';
import type { CrudOptions } from '../interface';

/**
 * Custom parameter decorator that filters request body based on allowedParams
 * 
 * @param allowedParams - Optional array of allowed parameter keys. 
 *                       If not provided, uses allowedParams from @Crud decorator
 * @returns Filtered request body containing only allowed parameters
 * 
 * @example
 * ```typescript
 * // Manual allowedParams
 * @Post()
 * async create(@FilteredBody(['name', 'email', 'phone']) createUserDto: any) {
 *   // createUserDto only contains name, email, phone
 * }
 * 
 * // Auto allowedParams from @Crud decorator
 * @Crud({ allowedParams: ['name', 'email', 'phone'] })
 * @Post()
 * async create(@FilteredBody() createUserDto: any) {
 *   // Automatically uses allowedParams from @Crud decorator
 * }
 * ```
 */
export const FilteredBody = createParamDecorator<string[] | undefined>(
  (allowedParams: string[] | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return {};
    }

    // If allowedParams not provided, try to get from @Crud decorator
    if (!allowedParams || allowedParams.length === 0) {
      const controllerClass = ctx.getClass();
      const crudOptions: CrudOptions | undefined = Reflect.getMetadata(CRUD_OPTIONS_METADATA, controllerClass);

      if (crudOptions?.allowedParams) {
        allowedParams = crudOptions.allowedParams.map(key => String(key));
      } else {
        // If no allowedParams found anywhere, return original body
        return body;
      }
    }

    // Filter body to only include allowed parameters
    const filteredBody: any = {};

    for (const key of Object.keys(body)) {
      if (allowedParams.includes(key)) {
        filteredBody[key] = body[key];
      }
    }

    return filteredBody;
  },
);

/**
 * Type-safe FilteredBody that automatically uses allowedParams from @Crud decorator
 * Reads allowedParams configuration from the controller's @Crud decorator
 * 
 * @example
 * ```typescript
 * @Crud({
 *   entity: User,
 *   allowedParams: ['name', 'email', 'phone']
 * })
 * @Controller('users')
 * export class UserController {
 *   @Post()
 *   async create(@TypedFilteredBody<User>() createUserDto: Partial<User>) {
 *     // Automatically uses allowedParams from @Crud decorator
 *   }
 * }
 * ```
 */
export const TypedFilteredBody = <T = any>() => {
  return createParamDecorator(
    (data: unknown, ctx: ExecutionContext): Partial<T> => {
      const request = ctx.switchToHttp().getRequest<Request>();
      const body = request.body;

      if (!body || typeof body !== 'object') {
        return {} as Partial<T>;
      }

      // Get controller class from execution context
      const controllerClass = ctx.getClass();

      // Read CrudOptions from metadata
      const crudOptions: CrudOptions | undefined = Reflect.getMetadata(CRUD_OPTIONS_METADATA, controllerClass);

      if (!crudOptions?.allowedParams) {
        // If no allowedParams configured, return original body
        return body as Partial<T>;
      }

      // Filter body based on allowedParams from @Crud decorator
      const filteredBody: any = {};
      const allowedKeyStrings = crudOptions.allowedParams.map(key => String(key));

      for (const key of Object.keys(body)) {
        if (allowedKeyStrings.includes(key)) {
          filteredBody[key] = body[key];
        }
      }

      return filteredBody as Partial<T>;
    }
  )();
};

/**
 * Type-safe FilteredBody with method-specific allowedParams
 * Uses route-specific allowedParams if configured, falls back to global allowedParams
 * 
 * @param method - CRUD method name ('create', 'update', etc.)
 * @example
 * ```typescript
 * @Crud({
 *   entity: User,
 *   allowedParams: ['name', 'email', 'phone'],
 *   routes: {
 *     create: { allowedParams: ['name', 'email', 'password'] },
 *     update: { allowedParams: ['name', 'email'] }
 *   }
 * })
 * @Controller('users')
 * export class UserController {
 *   @Post()
 *   async create(@MethodFilteredBody<User>('create') createUserDto: Partial<User>) {
 *     // Uses create-specific allowedParams: ['name', 'email', 'password']
 *   }
 * 
 *   @Put(':id')
 *   async update(@MethodFilteredBody<User>('update') updateUserDto: Partial<User>) {
 *     // Uses update-specific allowedParams: ['name', 'email']
 *   }
 * }
 * ```
 */
export const MethodFilteredBody = <T = any>(method: 'create' | 'update' | 'upsert' | string) => {
  return createParamDecorator(
    (data: unknown, ctx: ExecutionContext): Partial<T> => {
      const request = ctx.switchToHttp().getRequest<Request>();
      const body = request.body;

      if (!body || typeof body !== 'object') {
        return {} as Partial<T>;
      }

      // Get controller class from execution context
      const controllerClass = ctx.getClass();

      // Read CrudOptions from metadata
      const crudOptions: CrudOptions | undefined = Reflect.getMetadata(CRUD_OPTIONS_METADATA, controllerClass);

      if (!crudOptions) {
        return body as Partial<T>;
      }

      // Get method-specific allowedParams or fallback to global
      const methodOptions = crudOptions.routes?.[method as keyof typeof crudOptions.routes];
      const allowedParams = (methodOptions as any)?.allowedParams || crudOptions.allowedParams;

      if (!allowedParams) {
        return body as Partial<T>;
      }

      // Filter body based on allowedParams
      const filteredBody: any = {};
      const allowedKeyStrings = allowedParams.map((key: any) => String(key));

      for (const key of Object.keys(body)) {
        if (allowedKeyStrings.includes(key)) {
          filteredBody[key] = body[key];
        }
      }

      return filteredBody as Partial<T>;
    }
  )();
};

/**
 * Format validation errors for user-friendly response
 */
function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.constraints) {
      const fieldMessages = Object.values(error.constraints);
      messages.push(`${error.property}: ${fieldMessages.join(', ')}`);
    }
  }

  return messages.join('; ');
}

/**
 * Simple validation decorator that only checks allowedParams
 * Throws error if disallowed parameters are present (no class-validator integration)
 * 
 * @param allowedParams - Optional array of allowed parameter keys.
 *                       If not provided, uses allowedParams from @Crud decorator
 * @returns Filtered request body or throws BadRequestException
 * 
 * @example
 * ```typescript
 * // Auto allowedParams from @Crud decorator
 * @Crud({ allowedParams: ['name', 'email'] })
 * @Post()
 * async create(@ValidatedBody() createUserDto: any) {
 *   // Only checks allowedParams, no class-validator validation
 * }
 * 
 * // Manual allowedParams
 * @Post()
 * async create(@ValidatedBody(['name', 'email']) createUserDto: any) {
 *   // Only checks if disallowed fields are present
 * }
 * ```
 */
export const ValidatedBody = createParamDecorator<string[] | undefined>(
  (allowedParams: string[] | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const body = request.body;

    if (!body || typeof body !== 'object') {
      return {};
    }

    // If allowedParams not provided, try to get from @Crud decorator
    if (!allowedParams || allowedParams.length === 0) {
      const controllerClass = ctx.getClass();
      const crudOptions: CrudOptions | undefined = Reflect.getMetadata(CRUD_OPTIONS_METADATA, controllerClass);

      if (crudOptions?.allowedParams) {
        allowedParams = crudOptions.allowedParams.map(key => String(key));
      } else {
        // If no allowedParams found anywhere, return original body
        return body;
      }
    }

    // Check for disallowed parameters
    const bodyKeys = Object.keys(body);
    const disallowedKeys = bodyKeys.filter(key => !allowedParams!.includes(key));

    if (disallowedKeys.length > 0) {
      throw new BadRequestException(`허용되지 않은 파라미터: ${disallowedKeys.join(', ')}`);
    }

    return body;
  },
);

/**
 * Class-validator integrated body decorator
 * Filters allowedParams (silently) AND validates data using Entity validation decorators (with errors)
 * 
 * @param entityClass - Optional Entity class for validation. If not provided, uses entity from @Crud decorator
 * @returns Validated and filtered request body or throws BadRequestException for validation errors only
 * 
 * @example
 * ```typescript
 * // Auto Entity and allowedParams from @Crud decorator
 * @Crud({ 
 *   entity: User,
 *   allowedParams: ['name', 'email', 'phone'],
 *   routes: {
 *     create: { allowedParams: ['name', 'email', 'password'] }  // 메서드별 설정이 우선
 *   }
 * })
 * @Post()
 * async create(@ClassValidatedBody() createUserDto: any) {
 *   // 1. Method allowedParams 우선: ['name', 'email', 'password']
 *   // 2. 허용되지 않은 필드는 조용히 제거 (오류 없음)
 *   // 3. Entity의 @IsEmail() 등으로 검증 후 오류 반환
 * }
 * 
 * // Manual Entity class
 * @Put(':id')
 * async update(@ClassValidatedBody(User) updateUserDto: any) {
 *   // User entity + @Crud allowedParams로 검증
 * }
 * ```
 */
export const ClassValidatedBody = <T = any>(entityClass?: new () => T) => {
  return createParamDecorator(
    async (data: unknown, ctx: ExecutionContext): Promise<Partial<T>> => {
      const request = ctx.switchToHttp().getRequest<Request>();
      const body = request.body;

      if (!body || typeof body !== 'object') {
        return {} as Partial<T>;
      }

      // Get controller class and handler method from execution context
      const controllerClass = ctx.getClass();
      const handlerMethod = ctx.getHandler();
      const methodName = handlerMethod.name.toLowerCase(); // create, update, etc.

      const crudOptions: CrudOptions | undefined = Reflect.getMetadata(CRUD_OPTIONS_METADATA, controllerClass);

      // Use provided entityClass or get from @Crud decorator
      const targetEntityClass = entityClass || crudOptions?.entity;

      if (!targetEntityClass) {
        throw new BadRequestException('Entity class가 제공되지 않았습니다. @Crud 데코레이터에 entity를 설정하거나 매개변수로 전달하세요.');
      }

      // Filter by allowedParams if configured
      // Priority: method-specific allowedParams > global allowedParams
      let filteredBody = body;
      if (crudOptions) {
        // Get method-specific allowedParams first, then fallback to global
        const methodOptions = crudOptions.routes?.[methodName as keyof typeof crudOptions.routes];
        const allowedParams = (methodOptions as any)?.allowedParams || crudOptions.allowedParams;

        if (allowedParams) {
          const allowedKeyStrings = allowedParams.map((key: any) => String(key));
          const tempBody: any = {};

          // Silently filter - only include allowed parameters
          for (const key of Object.keys(body)) {
            if (allowedKeyStrings.includes(key)) {
              tempBody[key] = body[key];
            }
          }

          filteredBody = tempBody;
        }
      }

      try {
        // Convert plain object to class instance for validation
        const instance = plainToInstance(targetEntityClass as any, filteredBody);

        // Perform class-validator validation
        const errors = await validate(instance, {
          whitelist: true,  // Strip non-whitelisted properties
          forbidNonWhitelisted: false,  // Don't throw error for non-whitelisted (we already filtered)
          skipMissingProperties: true,  // Allow partial validation for updates
          validationError: {
            target: false,  // Don't include target in error
            value: false    // Don't include value in error for security
          }
        });

        if (errors.length > 0) {
          const errorMessage = formatValidationErrors(errors);
          throw new BadRequestException(`데이터 검증 실패: ${errorMessage}`);
        }

        // Return the filtered and validated data as plain object
        return filteredBody as Partial<T>;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Handle other validation errors
        throw new BadRequestException('데이터 검증 중 오류가 발생했습니다.');
      }
    }
  )();
}; 