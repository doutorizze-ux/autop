import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../middlewares/auth.middleware';
import { BotService } from '../services/bot.service';

const router = Router();

router.use(authMiddleware);

function getUserId(req: AuthRequest) {
    return String(req.user?.userId || '').trim();
}

router.get('/config', async (req: AuthRequest, res) => {
    try {
        const config = await BotService.getConfig(getUserId(req));
        res.json(config);
    } catch (err: any) {
        res.status(500).json({ message: err?.message || 'Erro ao buscar configuracao do bot' });
    }
});

router.put('/config', async (req: AuthRequest, res) => {
    try {
        const config = await BotService.updateConfig(getUserId(req), req.body || {});
        res.json(config);
    } catch (err: any) {
        res.status(500).json({ message: err?.message || 'Erro ao salvar configuracao do bot' });
    }
});

export default router;
