import { Router } from 'express';
import { issueNavigatorController } from '../controllers/issue-navigator.controller';
import { validateIssueNavigatorRequest } from '../middlewares/validate.middleware';
import { issueNavigatorRateLimiter } from '../middlewares/rate-limit.middleware';
const router = Router();
router.post('/', issueNavigatorRateLimiter, validateIssueNavigatorRequest, (req,res,next) => {
  issueNavigatorController.investigate(req,res).catch(next);
});
export default router;
