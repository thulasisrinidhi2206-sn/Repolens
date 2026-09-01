import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[RepoLens Server Error]', err);
  sendError(res, 'Internal server error', 500);
}
