import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { AuthRequest, authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

function getUserId(req: AuthRequest) {
    return String(req.user?.userId || '').trim();
}

router.get('/status', async (req: AuthRequest, res) => {
    try {
        const userId = getUserId(req);
        const status = whatsappService.getStatus(userId);

        if (status.status === 'disconnected') {
            void whatsappService.init(userId).catch((error) => console.error('WhatsApp lazy init error:', error));
        }

        res.json(status);
    } catch (err: any) {
        res.status(401).json({ message: err.message });
    }
});

router.post('/reconnect', async (req: AuthRequest, res) => {
    try {
        const userId = getUserId(req);
        const status = await whatsappService.reconnect(userId, true);
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/send', async (req: AuthRequest, res) => {
    try {
        const { to, text } = req.body;
        await whatsappService.sendMessage(getUserId(req), to, text);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/sync-phones', async (req: AuthRequest, res) => {
    try {
        const result = await whatsappService.syncUnresolvedClientPhones(getUserId(req));
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
