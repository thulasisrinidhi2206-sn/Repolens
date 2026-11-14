import { Request, Response } from 'express';
import { issueNavigatorService } from '../services/issue-navigator.service';
import { sendError, sendSuccess } from '../utils/response';
export class IssueNavigatorController {
  public async investigate(req: Request, res: Response): Promise<void> {
    const result = await issueNavigatorService.investigate(req.body.repositoryUrl, Number(req.body.issueNumber));
    if (!result.success || !result.data) { sendError(res, result.error || 'Unable to investigate issue.', result.statusCode || 400); return; }
    sendSuccess(res, result.data, 'Issue investigation completed.');
  }
}
export const issueNavigatorController = new IssueNavigatorController();
