import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { AuthRequest, authMiddleware } from '../middlewares/auth.middleware';
import { listWhatsappChannels, normalizeWhatsappChannelKey } from '../services/whatsapp-channel.service';

const router = Router();

router.use(authMiddleware);

function getUserId(req: AuthRequest) {
    return String(req.user?.userId || '').trim();
}

function getChannelKey(req: AuthRequest) {
    return normalizeWhatsappChannelKey((req.query?.channel || req.body?.channel || req.body?.whatsappChannelKey) as string);
}

router.get('/channels', async (_req: AuthRequest, res) => {
    res.json({ channels: listWhatsappChannels() });
});

router.get('/status', async (req: AuthRequest, res) => {
    try {
        const userId = getUserId(req);
        const channelKey = getChannelKey(req);
        const autoStart = String(req.query?.autoStart ?? 'true') !== 'false';
        const status = whatsappService.getStatus(userId, channelKey);

        if (autoStart && status.status === 'disconnected') {
            void whatsappService.init(userId, channelKey).catch((error) => console.error('WhatsApp lazy init error:', error));
        }

        res.json(status);
    } catch (err: any) {
        res.status(401).json({ message: err.message });
    }
});

router.post('/reconnect', async (req: AuthRequest, res) => {
    try {
        const userId = getUserId(req);
        const status = await whatsappService.reconnect(userId, getChannelKey(req), true);
        res.json(status);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/send', async (req: AuthRequest, res) => {
    try {
        const { to, text } = req.body;
        await whatsappService.sendMessage(getUserId(req), to, text, getChannelKey(req));
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/sync-phones', async (req: AuthRequest, res) => {
    try {
        const result = await whatsappService.syncUnresolvedClientPhones(getUserId(req), getChannelKey(req));
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
