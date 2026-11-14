import { Request, Response } from 'express';
import { askRepositoryService } from '../services/ask-repository.service';
import { sendError, sendSuccess } from '../utils/response';

export class AskRepositoryController {
  public async ask(req: Request, res: Response): Promise<void> {
    const result = await askRepositoryService.ask(req.body.repositoryUrl, req.body.question);
    if (!result.success || !result.data) {
      sendError(res, result.error || 'Unable to answer repository question.', result.statusCode || 400);
      return;
    }
    sendSuccess(res, result.data, 'Repository question answered.');
  }
}

export const askRepositoryController = new AskRepositoryController();
