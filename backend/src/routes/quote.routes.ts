import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { searchQuote, exportPDF, exportExcel } from '../controllers/quote.controller';

const router = Router();

router.use(authMiddleware);

router.post('/search', searchQuote);
router.post('/export/pdf', exportPDF);
router.post('/export/excel', exportExcel);

export default router;
