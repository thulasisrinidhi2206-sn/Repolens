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

/**
 * Middleware to validate that preview creation request body contains repositoryUrl
 */
export const validatePreviewRequest = validateAnalyzeRequest;


/**
 * Validate a repository question request before any GitHub API calls.
 */
export function validateAskRequest(req: Request, res: Response, next: NextFunction): void {
  const { repositoryUrl, question } = req.body || {};
  if (typeof repositoryUrl !== 'string' || repositoryUrl.trim().length === 0) {
    sendError(res, 'Field "repositoryUrl" is required and must be a non-empty string.', 400);
    return;
  }
  if (typeof question !== 'string' || question.trim().length < 5 || question.trim().length > 500) {
    sendError(res, 'Field "question" is required and must contain between 5 and 500 characters.', 400);
    return;
  }
  next();
}

/** Validate issue investigation input before GitHub API calls. */
export function validateIssueNavigatorRequest(req: Request, res: Response, next: NextFunction): void {
  const { repositoryUrl, issueNumber } = req.body || {};
  if (typeof repositoryUrl !== 'string' || repositoryUrl.trim().length === 0) {
    sendError(res, 'Field "repositoryUrl" is required and must be a non-empty string.', 400);
    return;
  }
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    sendError(res, 'Field "issueNumber" must be a positive integer.', 400);
    return;
  }
  next();
}
