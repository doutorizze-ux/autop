import { Request, Response } from 'express';
import { CatalogService } from '../services/catalog.service';

export async function searchVdoCatalog(req: Request, res: Response) {
    try {
        const query = String(req.query.q || '').trim();
        const limit = Number.parseInt(String(req.query.limit || '40'), 10) || 40;

        if (!query || query.length < 2) {
            res.json({ query, items: [] });
            return;
        }

        const items = CatalogService.search(query, Math.min(Math.max(limit, 1), 100));
        res.json({ query, items });
    } catch (error) {
        console.error('Catalog Search Error:', error);
        res.status(500).json({ message: 'Erro ao buscar códigos no catálogo.' });
    }
}
