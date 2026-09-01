import { Request, Response } from 'express';
import { analyzeService } from '../services/analyze.service';
import { sendSuccess, sendError } from '../utils/response';

export class AnalyzeController {
  /**
   * Handles POST /api/analyze requests
   */
  public analyzeRepository(req: Request, res: Response): void {
    const { repositoryUrl } = req.body;

    const result = analyzeService.analyzeRepository(repositoryUrl);

    if (!result.success) {
      sendError(res, result.error, 400);
      return;
    }

    sendSuccess(res, result.data, 'Repository analysis request processed successfully', 200);
  }
}

export const analyzeController = new AnalyzeController();
