import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
    searchQuote,
    exportPDF,
    exportExcel,
    listQuoteHistory,
    getQuoteHistoryById,
    exportSavedQuotePDF,
    exportSavedQuoteExcel,
} from '../controllers/quote.controller';

const router = Router();

router.use(authMiddleware);

router.post('/search', searchQuote);
router.post('/export/pdf', exportPDF);
router.post('/export/excel', exportExcel);
router.get('/history', listQuoteHistory);
router.get('/history/:id', getQuoteHistoryById);
router.get('/history/:id/export/pdf', exportSavedQuotePDF);
router.get('/history/:id/export/excel', exportSavedQuoteExcel);

export default router;
