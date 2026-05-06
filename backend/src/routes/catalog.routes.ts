import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { searchVdoCatalog } from '../controllers/catalog.controller';

const router = Router();

router.use(authMiddleware);
router.get('/vdo/search', searchVdoCatalog);

export default router;
