import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class SerializeUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (!value || typeof value !== 'object') {
          return value;
        }

        if ('passwordHash' in value) {
          const { passwordHash: _passwordHash, ...rest } = value as Record<string, unknown>;
          return rest;
        }

        return value;
      }),
    );
  }
}
