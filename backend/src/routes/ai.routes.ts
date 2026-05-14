import { Router } from 'express';
import { AIService } from '../services/ai.service';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/interpret', async (req, res) => {
    try {
        const { message } = req.body;
        const result = await AIService.interpretMessage(message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Erro na IA' });
    }
});

router.post('/suggest', async (req, res) => {
    try {
        const { product, quotes } = req.body;
        const suggestion = await AIService.suggestResponse(product, quotes);
        res.json({ suggestion });
    } catch (err) {
        res.status(500).json({ message: 'Erro na IA' });
    }
});

router.post('/whatsapp-suggestion', async (req, res) => {
    try {
        const { clientName, messages } = req.body;
        const suggestion = await AIService.suggestWhatsappReply({
            clientName,
            messages: Array.isArray(messages) ? messages : [],
        });

        res.json({ suggestion });
    } catch (err: any) {
        res.status(500).json({
            message: AIService.getFriendlyErrorMessage(err),
        });
    }
});

export default router;
