import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

export class SuccessEnvelopeDto<T = unknown> {
  @ApiProperty({ example: 0, description: '业务状态码，0 表示成功。' })
  code!: number;

  @ApiProperty({ example: 'ok', description: '业务提示信息。' })
  message!: string;

  data!: T;
}

export function ApiSuccessResponse<TModel extends Type<unknown>>(
  model?: TModel,
  options?: {
    description?: string;
    example?: unknown;
    isArray?: boolean;
  },
) {
  const decorators = [] as Array<ClassDecorator | MethodDecorator | PropertyDecorator>;

  if (model) {
    decorators.push(ApiExtraModels(SuccessEnvelopeDto, model));
    decorators.push(
      ApiOkResponse({
        description: options?.description,
        schema: {
          allOf: [
            { $ref: getSchemaPath(SuccessEnvelopeDto) },
            {
              properties: {
                data: options?.isArray
                  ? { type: 'array', items: { $ref: getSchemaPath(model) } }
                  : { $ref: getSchemaPath(model) },
              },
            },
          ],
          ...(options?.example ? { example: { code: 0, message: 'ok', data: options.example } } : {}),
        },
      }),
    );
  } else {
    decorators.push(
      ApiOkResponse({
        description: options?.description,
        schema: {
          example: {
            code: 0,
            message: 'ok',
            data: options?.example ?? null,
          },
        },
      }),
    );
  }

  return applyDecorators(...decorators);
}
