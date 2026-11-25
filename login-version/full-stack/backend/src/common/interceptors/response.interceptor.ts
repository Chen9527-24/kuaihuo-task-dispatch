import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (this.isWrappedResponse(data)) {
          return data;
        }

        return {
          code: 0,
          message: 'ok',
          data,
        };
      }),
    );
  }

  private isWrappedResponse(value: unknown): value is {
    code: number;
    message: string;
    data: unknown;
  } {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as Record<string, unknown>;
    return (
      typeof record.code === 'number' &&
      typeof record.message === 'string' &&
      Object.prototype.hasOwnProperty.call(record, 'data')
    );
  }
}
