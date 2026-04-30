import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/status', (req, res) => {
    res.json({ 
        status: whatsappService.status, 
        qr: whatsappService.qr 
    });
});

router.post('/reconnect', async (_req, res) => {
    try {
        await whatsappService.reconnect();
        res.json({
            status: whatsappService.status,
            qr: whatsappService.qr,
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

export default router;
