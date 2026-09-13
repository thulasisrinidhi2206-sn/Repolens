import { Request, Response } from 'express';
import { analyzeService } from '../services/analyze.service';
import { sendSuccess, sendError } from '../utils/response';

export class AnalyzeController {
  /**
   * Handles POST /api/analyze requests asynchronously
   */
  public async analyzeRepository(req: Request, res: Response): Promise<void> {
    const { repositoryUrl } = req.body;

    const result = await analyzeService.analyzeRepository(repositoryUrl);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Failed to analyze repository', result.statusCode || 400);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Repository analysis completed successfully',
      result.statusCode || 200
    );
  }
}

export const analyzeController = new AnalyzeController();
