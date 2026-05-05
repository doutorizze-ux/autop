import { Router } from 'express';
import {
    agentHeartbeat,
    completeAgentTask,
    failAgentTask,
    getLocalAgentStatus,
    pullNextAgentTask,
} from '../controllers/local-agent.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.post('/heartbeat', agentHeartbeat);
router.post('/tasks/next', pullNextAgentTask);
router.post('/tasks/:taskId/complete', completeAgentTask);
router.post('/tasks/:taskId/fail', failAgentTask);

router.get('/status', authMiddleware, getLocalAgentStatus);

export default router;
