import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

/**
 * Middleware to validate that request body contains a repositoryUrl string
 */
export function validateAnalyzeRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { repositoryUrl } = req.body || {};

  if (!repositoryUrl || typeof repositoryUrl !== 'string' || repositoryUrl.trim().length === 0) {
    sendError(res, 'Field "repositoryUrl" is required and must be a non-empty string.', 400);
    return;
  }

  next();
}
