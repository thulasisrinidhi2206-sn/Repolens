import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

const router = Router();

// GET /api/health
router.get('/', (req, res) => {
  healthController.getHealth(req, res);
});

export default router;
