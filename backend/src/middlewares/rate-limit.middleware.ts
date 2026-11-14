import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * Creates an in-memory rate limiting middleware
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const { windowMs, maxRequests, message = 'Too many requests. Please try again later.' } = options;
  const ipMap = new Map<string, RateLimitRecord>();

  // Periodically cleanup expired records every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      if (record.resetTime <= now) {
        ipMap.delete(ip);
      }
    }
  }, 120000);

  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, skip rate limiting
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = ipMap.get(ip);
    if (!record || record.resetTime <= now) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      ipMap.set(ip, record);
    } else {
      record.count++;
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      sendError(res, message, 429);
      return;
    }

    next();
  };
}

// 60 requests per minute for analysis & preview endpoints
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'API rate limit exceeded. Please wait a moment before sending more repository requests.',
});

/** Lower request budget for repository Q&A because it reads source files and may call an AI provider. */
export const askRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 8,
  message: 'Repository Q&A limit reached. Please wait a minute before asking more questions.',
});
