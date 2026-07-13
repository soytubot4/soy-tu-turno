import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: exception.errors },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string' ? res : (res as { message?: string }).message ?? exception.message;
      response.status(status).json({ ok: false, error: { code: this.codeFor(status), message } });
      return;
    }

    this.logger.error('Unhandled exception', exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      error: { code: 'INTERNAL', message: 'Algo salió mal' },
    });
  }

  private codeFor(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
    };
    return map[status] ?? 'ERROR';
  }
}
