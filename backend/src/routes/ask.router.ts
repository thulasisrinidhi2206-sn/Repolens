import { Router } from 'express';
import { askRepositoryController } from '../controllers/ask-repository.controller';
import { validateAskRequest } from '../middlewares/validate.middleware';
import { askRateLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

router.post('/', askRateLimiter, validateAskRequest, (req, res, next) => {
  askRepositoryController.ask(req, res).catch(next);
});

export default router;
