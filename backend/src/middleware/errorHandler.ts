import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode < 500 ? err.message : 'Internal server error';

  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      path: req.path,
      method: req.method,
      error: err.message,
      code: err.code,
    });
  }

  res.status(statusCode).json({
    error: message,
    code: err.code,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function createError(message: string, statusCode: number, code?: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
