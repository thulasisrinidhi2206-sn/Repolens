import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export class HealthController {
  /**
   * Returns backend health and operational status
   */
  public getHealth(_req: Request, res: Response): void {
    const healthData = {
      status: 'healthy',
      service: 'repolens-backend',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    sendSuccess(res, healthData, 'RepoLens Backend API is operational');
  }
}

export const healthController = new HealthController();
