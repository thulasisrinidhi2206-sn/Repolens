import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware';

dotenv.config();

/**
 * Creates and configures the Express application
 */
export function createApp(): Express {
  const app = express();

  // Basic Middlewares
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
  }));
  app.use(express.json());

  // Mount API routes
  app.use('/api', apiRouter);

  // Fallback 404 and Error handling middlewares
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
