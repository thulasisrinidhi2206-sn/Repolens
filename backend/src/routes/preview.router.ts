import { Router } from 'express';
import { previewController } from '../controllers/preview.controller';
import { validatePreviewRequest } from '../middlewares/validate.middleware';

const router = Router();

// POST /api/preview - Create a new isolated preview session
router.post('/', validatePreviewRequest, (req, res, next) => {
  previewController.createPreview(req, res).catch(next);
});

// GET /api/preview/:previewId - Retrieve status and logs of a preview session
router.get('/:previewId', (req, res, next) => {
  previewController.getPreviewStatus(req, res).catch(next);
});

// DELETE /api/preview/:previewId - Terminate preview session and cleanup container/workspace
router.delete('/:previewId', (req, res, next) => {
  previewController.stopPreview(req, res).catch(next);
});

export default router;

