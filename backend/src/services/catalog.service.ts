import fs from 'fs';
import path from 'path';

type CatalogRecord = {
    code: string;
    description: string;
    brand?: string;
    category?: string;
    family?: string;
    context?: string[];
    applications?: string[];
    references?: string[];
    searchText: string;
};

type CatalogPayload = {
    generatedAt: string;
    count: number;
    items: CatalogRecord[];
};

export type CatalogSearchResult = {
    code: string;
    description: string;
    brand: string;
    category: string;
    family: string;
    applications: string[];
    references: string[];
    score: number;
};

function normalizeText(value: string) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export class CatalogService {
    private static payload: CatalogPayload | null = null;

    private static loadPayload() {
        if (this.payload) return this.payload;

        const filePath = path.resolve(__dirname, '../../data/vdo-catalog.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        this.payload = JSON.parse(raw) as CatalogPayload;
        return this.payload;
    }

    static search(query: string, limit = 40): CatalogSearchResult[] {
        const payload = this.loadPayload();
        const normalizedQuery = normalizeText(query);

        if (!normalizedQuery || normalizedQuery.length < 2) {
            return [];
        }

        const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);

        const scored = payload.items
            .map((item) => {
                const text = item.searchText || normalizeText(
                    [
                        item.code,
                        item.description,
                        item.brand,
                        item.category,
                        item.family,
                        ...(item.applications || []),
                        ...(item.references || []),
                    ]
                        .filter(Boolean)
                        .join(' ')
                );

                let score = 0;

                if (normalizeText(item.code) === normalizedQuery) {
                    score += 500;
                } else if (normalizeText(item.code).includes(normalizedQuery)) {
                    score += 220;
                }

                const descriptionText = normalizeText(item.description);
                const familyText = normalizeText(item.family || '');
                const categoryText = normalizeText(item.category || '');
                const brandText = normalizeText(item.brand || '');

                let matchedTokens = 0;

                tokens.forEach((token) => {
                    if (descriptionText.includes(token)) score += 40;
                    if (familyText.includes(token)) score += 28;
                    if (categoryText.includes(token)) score += 16;
                    if (brandText.includes(token)) score += 14;
                    if (text.includes(token)) {
                        score += 10;
                        matchedTokens += 1;
                    }
                });

                if (tokens.length > 1 && matchedTokens < Math.min(2, tokens.length)) {
                    score -= 120;
                }

                return {
                    ...item,
                    score,
                };
            })
            .filter((item) => item.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR');
            })
            .slice(0, limit);

        return scored.map((item) => ({
            code: item.code,
            description: item.description,
            brand: item.brand || '',
            category: item.category || '',
            family: item.family || '',
            applications: (item.applications || []).slice(0, 8),
            references: (item.references || []).slice(0, 6),
            score: item.score,
        }));
    }
}
