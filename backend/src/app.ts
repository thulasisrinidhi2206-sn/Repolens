import path from 'path';
import dotenv from 'dotenv';

// Load .env from backend directory or project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import express, { Express } from 'express';
import cors, { CorsOptions } from 'cors';
import apiRouter from './routes';
import healthRouter from './routes/health.router';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware';

/**
 * Creates and configures the Express application
 */
export function createApp(): Express {
  const app = express();

  // Configure CORS
  const configuredCorsOrigin = process.env.CORS_ORIGIN;
  const isProd = process.env.NODE_ENV === 'production';

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl, server-to-server, health checks)
      if (!origin) {
        return callback(null, true);
      }

      // In development or if explicitly set to '*', allow all
      if (!isProd || configuredCorsOrigin === '*' || !configuredCorsOrigin) {
        return callback(null, true);
      }

      // Allow Chrome extensions
      if (origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }

      if (configuredCorsOrigin) {
        const allowedList = configuredCorsOrigin.split(',').map(s => s.trim().toLowerCase());
        if (allowedList.includes(origin.toLowerCase())) {
          return callback(null, true);
        }
      }

      // Default allow GitHub origins
      if (origin === 'https://github.com' || origin === 'https://www.github.com') {
        return callback(null, true);
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  // Root health endpoints for cloud platforms (Render, Railway, Fly.io, etc.)
  app.use('/health', healthRouter);

  // Mount API routes (/api/health, /api/analyze, /api/preview)
  app.use('/api', apiRouter);

  // Fallback 404 and Error handling middlewares
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
