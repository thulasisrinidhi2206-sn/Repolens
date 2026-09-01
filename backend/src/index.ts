import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ApiResponse } from '@repolens/shared';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Health check route
app.get('/api/health', (_req: Request, res: Response) => {
  const response: ApiResponse<{ status: string; service: string }> = {
    success: true,
    data: {
      status: 'healthy',
      service: 'repolens-backend'
    },
    timestamp: new Date().toISOString()
  };
  res.json(response);
});

// Service status route
app.get('/api/status', (_req: Request, res: Response) => {
  const response: ApiResponse<{
    name: string;
    version: string;
    description: string;
  }> = {
    success: true,
    data: {
      name: 'RepoLens Backend API',
      version: '0.1.0',
      description: 'GitHub Visual Preview & Project Evaluation Platform'
    },
    timestamp: new Date().toISOString()
  };
  res.json(response);
});

// 404 handler
app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  };
  res.status(404).json(response);
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  };
  res.status(500).json(response);
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 RepoLens backend API listening on http://localhost:${PORT}`);
  });
}

export default app;
