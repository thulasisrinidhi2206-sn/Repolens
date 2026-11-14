import { Router } from 'express';
import healthRouter from './health.router';
import analyzeRouter from './analyze.router';
import previewRouter from './preview.router';
import askRouter from './ask.router';
import issueNavigatorRouter from './issue-navigator.router';

const router = Router();

// Root API router (/api/...)
router.use('/health', healthRouter);
router.use('/analyze', analyzeRouter);
router.use('/preview', previewRouter);
router.use('/ask', askRouter);
router.use('/issue-navigator', issueNavigatorRouter);

export default router;

