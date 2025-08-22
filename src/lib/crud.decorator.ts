/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any */
import { CrudRouteFactory } from './crud.route.factory';
import { CrudService } from './crud.service';
import { CRUD_OPTIONS_METADATA } from './constants';
import { buildCrudOptionsFromChaining } from './decorator/chaining.decorator';
import { buildConditionalCrudOptions } from './decorator/conditional.decorator';

import type { CrudOptions } from './interface';

type Constructor = new (...args: any[]) => any;

export const Crud =
    (options?: CrudOptions) =>
        <T extends Constructor>(target: T) => {
            // 체이닝 데코레이터로부터 옵션 가져오기
            const chainingOptions = buildCrudOptionsFromChaining(target);
            const conditionalOptions = buildConditionalCrudOptions(target);

            // 옵션 병합 (우선순위: options > conditionalOptions > chainingOptions)
            const finalOptions: CrudOptions = {
                ...chainingOptions,
                ...conditionalOptions,
                ...options,
            };

            // 최소한의 유효성 검증
            if (!finalOptions.entity) {
                throw new Error('Entity must be provided either through @Crud options or @CrudEntity decorator');
            }

            // Store final CrudOptions in metadata for later use
            Reflect.defineMetadata(CRUD_OPTIONS_METADATA, finalOptions, target);

            const crudRouteFactory = new CrudRouteFactory(target, finalOptions);
            crudRouteFactory.init();

            const ValidatedController = class extends target {
                constructor(...args: any[]) {
                    super(...args);
                    if (!(this.crudService instanceof CrudService)) {
                        throw new TypeError('controller should include member crudService, which is instance of CrudService');
                    }
                }
            };
            Object.defineProperty(ValidatedController, 'name', { value: target.name });
            return ValidatedController;
        };
