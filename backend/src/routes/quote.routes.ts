import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
    searchQuote,
    getQuoteJob,
    cancelQuoteJob,
    exportPDF,
    exportExcel,
    listQuoteHistory,
    getQuoteHistoryById,
    deleteQuoteHistory,
    exportSavedQuotePDF,
    exportMultipleSavedQuotesPDF,
    exportSavedQuoteExcel,
} from '../controllers/quote.controller';

const router = Router();

router.use(authMiddleware);

router.post('/search', searchQuote);
router.get('/jobs/:jobId', getQuoteJob);
router.post('/jobs/:jobId/cancel', cancelQuoteJob);
router.post('/export/pdf', exportPDF);
router.post('/export/excel', exportExcel);
router.get('/history', listQuoteHistory);
router.get('/history/:id', getQuoteHistoryById);
router.delete('/history/:id', deleteQuoteHistory);
router.post('/history/export/pdf', exportMultipleSavedQuotesPDF);
router.get('/history/:id/export/pdf', exportSavedQuotePDF);
router.get('/history/:id/export/excel', exportSavedQuoteExcel);

export default router;
