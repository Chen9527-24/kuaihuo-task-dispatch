import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (isPayloadTooLargeError(exception)) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        code: HttpStatus.PAYLOAD_TOO_LARGE,
        message: '请求数据过大，请精简后重试',
        data: null,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const normalized = this.normalizeHttpExceptionPayload(payload);

      response.status(status).json({
        code: status,
        message: normalized.message,
        data: normalized.data,
        errors: normalized.errors,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : `Unhandled exception: ${String(exception)}`,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeHttpExceptionPayload(payload: string | object) {
    if (typeof payload === 'string') {
      return { message: payload, data: null as unknown, errors: undefined as unknown };
    }

    const record = payload as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : 'Request failed';
    const errors = Array.isArray(record.errors)
      ? record.errors
      : Array.isArray(record.message)
        ? record.message
        : undefined;
    const data = Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : null;

    return { message, data, errors };
  }
}

function isPayloadTooLargeError(exception: unknown) {
  if (!exception || typeof exception !== 'object') return false;
  const value = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  return (value.status === HttpStatus.PAYLOAD_TOO_LARGE || value.statusCode === HttpStatus.PAYLOAD_TOO_LARGE)
    && value.type === 'entity.too.large';
}
