import { Router } from 'express';
import healthRouter from './health.router';
import analyzeRouter from './analyze.router';
import previewRouter from './preview.router';

const router = Router();

// Root API router (/api/...)
router.use('/health', healthRouter);
router.use('/analyze', analyzeRouter);
router.use('/preview', previewRouter);

export default router;

