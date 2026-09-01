import { Router } from 'express';
import { analyzeController } from '../controllers/analyze.controller';
import { validateAnalyzeRequest } from '../middlewares/validate.middleware';

const router = Router();

// POST /api/analyze
router.post('/', validateAnalyzeRequest, (req, res) => {
  analyzeController.analyzeRepository(req, res);
});

export default router;
