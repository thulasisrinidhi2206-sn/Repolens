import { Response } from 'express';
import { ApiResponse } from '@repolens/shared';

/**
 * Sends a standardized success API response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Response {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {}),
    timestamp: new Date().toISOString()
  };
  return res.status(statusCode).json(payload);
}

/**
 * Sends a standardized error API response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode = 400
): Response {
  const payload: ApiResponse = {
    success: false,
    error,
    timestamp: new Date().toISOString()
  };
  return res.status(statusCode).json(payload);
}
