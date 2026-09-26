import { Request, Response } from 'express';
import { previewService } from '../services/preview.service';
import { sendSuccess, sendError } from '../utils/response';

export class PreviewController {
  /**
   * Handles POST /api/preview requests
   */
  public async createPreview(req: Request, res: Response): Promise<void> {
    const { repositoryUrl } = req.body;

    const result = await previewService.createPreview(repositoryUrl);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Failed to create preview', result.statusCode || 400);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview created successfully',
      result.statusCode || 201
    );
  }

  /**
   * Handles GET /api/preview/:previewId requests
   */
  public async getPreviewStatus(req: Request, res: Response): Promise<void> {
    const previewId = Array.isArray(req.params.previewId) ? req.params.previewId[0] : req.params.previewId;

    const result = await previewService.getPreview(previewId);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Preview session not found', result.statusCode || 404);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview status retrieved',
      result.statusCode || 200
    );
  }

  /**
   * Handles DELETE /api/preview/:previewId (stop preview and cleanup)
   */
  public async stopPreview(req: Request, res: Response): Promise<void> {
    const previewId = Array.isArray(req.params.previewId) ? req.params.previewId[0] : req.params.previewId;

    const result = await previewService.stopPreview(previewId);

    if (!result.success || !result.data) {
      sendError(res, result.error || 'Failed to stop preview session', result.statusCode || 404);
      return;
    }

    sendSuccess(
      res,
      result.data,
      result.data.message || 'Preview session stopped successfully',
      result.statusCode || 200
    );
  }
}

export const previewController = new PreviewController();

