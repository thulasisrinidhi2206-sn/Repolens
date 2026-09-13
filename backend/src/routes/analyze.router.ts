import { Router } from 'express';
import { analyzeController } from '../controllers/analyze.controller';
import { validateAnalyzeRequest } from '../middlewares/validate.middleware';

const router = Router();

// POST /api/analyze
router.post('/', validateAnalyzeRequest, (req, res, next) => {
  analyzeController.analyzeRepository(req, res).catch(next);
});

export default router;
