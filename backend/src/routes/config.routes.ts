import { Router } from 'express';
import { ConfigService } from '../services/config.service';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const config = await ConfigService.getConfig();
        res.json(config);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao buscar configurações' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { aiKey, whatsappMode } = req.body;
        // Apenas ADMIN pode mudar configurações globais
        if ((req as any).user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Acesso negado' });
        }
        const config = await ConfigService.updateConfig({ aiKey, whatsappMode });
        res.json(config);
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar configurações' });
    }
});

router.post('/profile', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userId = (req as any).user.id;
        const user = await ConfigService.updateProfile(userId, { name, email, password });
        res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (err) {
        res.status(500).json({ message: 'Erro ao atualizar perfil' });
    }
});

export default router;
