import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/status', (req, res) => {
    res.json({ 
        status: whatsappService.status, 
        qr: whatsappService.qr,
        error: whatsappService.lastError,
    });
});

router.post('/reconnect', async (_req, res) => {
    try {
        await whatsappService.reconnect(true);
        res.json({
            status: whatsappService.status,
            qr: whatsappService.qr,
            error: whatsappService.lastError,
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/send', async (req, res) => {
    try {
        const { to, text } = req.body;
        await whatsappService.sendMessage(to, text);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/sync-phones', async (_req, res) => {
    try {
        const result = await whatsappService.syncUnresolvedClientPhones();
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
