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
    source?: string;
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
    source: string;
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

function normalizeCode(value: string) {
    return normalizeText(value).replace(/\s+/g, '');
}

const queryStopWords = new Set(['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os', 'para', 'por']);

function normalizeYearToken(token: string) {
    const value = Number.parseInt(token, 10);
    if (!Number.isFinite(value)) return null;

    if (token.length === 4) return value;
    if (token.length === 2) return value <= 35 ? 2000 + value : 1900 + value;

    return null;
}

function extractYearTokens(tokens: string[]) {
    return tokens
        .map((token) => (/^\d{2,4}$/.test(token) ? normalizeYearToken(token) : null))
        .filter((year): year is number => !!year && year >= 1950 && year <= 2099);
}

function dedupeContainedTokens(tokens: string[]) {
    const cleanedTokens: string[] = [];

    tokens.forEach((token) => {
        if (cleanedTokens.includes(token)) return;

        const isTokenTypingNoise = cleanedTokens.some(
            (existing) => existing.length >= 4 && token !== existing && token.includes(existing) && token.length - existing.length <= 3
        );

        if (isTokenTypingNoise) return;

        const noisyExistingIndex = cleanedTokens.findIndex(
            (existing) => token.length >= 4 && token !== existing && existing.includes(token) && existing.length - token.length <= 3
        );

        if (noisyExistingIndex >= 0) {
            cleanedTokens[noisyExistingIndex] = token;
            return;
        }

        cleanedTokens.push(token);
    });

    return cleanedTokens;
}

function buildRecordText(item: CatalogRecord) {
    return normalizeText(
        item.searchText ||
            [
                item.code,
                item.description,
                item.brand,
                item.category,
                item.family,
                ...(item.context || []),
                ...(item.applications || []),
                ...(item.references || []),
                item.source,
            ]
                .filter(Boolean)
                .join(' ')
    );
}

function buildRawRecordText(item: CatalogRecord) {
    return [
        item.code,
        item.description,
        item.brand,
        item.category,
        item.family,
        ...(item.context || []),
        ...(item.applications || []),
        ...(item.references || []),
        item.searchText,
        item.source,
    ]
        .filter(Boolean)
        .join(' ');
}

function normalizeRangeYear(value: string) {
    const cleanValue = String(value || '').replace(/\D/g, '');
    if (!cleanValue) return null;

    const yearToken = cleanValue.length >= 4 ? cleanValue.slice(-4) : cleanValue.slice(-2);
    return normalizeYearToken(yearToken);
}

function yearMatchesRange(rawText: string, year: number) {
    const normalized = String(rawText || '').replace(/\s+/g, ' ');
    let scrubbed = normalized;
    const isInRange = (startYear?: number | null, endYear?: number | null) =>
        !!startYear && year >= startYear && (!endYear || year <= endYear);
    const monthYearDashPattern = /(\d{1,2})[./](\d{2,4})\s*[-–]\s*(?:(\d{1,2})[./])?(\d{2,4}|\.{2,})?/g;
    let match: RegExpExecArray | null;

    while ((match = monthYearDashPattern.exec(normalized))) {
        const startYear = normalizeRangeYear(match[2]);
        const endYear = match[4]?.includes('.') ? null : normalizeRangeYear(match[4] || '');

        if (isInRange(startYear, endYear)) return true;
    }
    scrubbed = scrubbed.replace(monthYearDashPattern, ' ');

    const monthYearSlashPattern = /(\d{1,2})[.](\d{4})\s*\/\s*(?:(\d{1,2})[.]?)?(\d{4}|\.{2,})/g;
    while ((match = monthYearSlashPattern.exec(normalized))) {
        const startYear = normalizeRangeYear(match[2]);
        const endYear = match[4]?.includes('.') ? null : normalizeRangeYear(match[4] || '');

        if (isInRange(startYear, endYear)) return true;
    }
    scrubbed = scrubbed.replace(monthYearSlashPattern, ' ');

    const yearSlashPattern = /(?:^|\D)(\d{4})\s*\/\s*(\d{4}|\.{2,})(?:\D|$)/g;
    while ((match = yearSlashPattern.exec(normalized))) {
        const startYear = normalizeRangeYear(match[1]);
        const endYear = match[2]?.includes('.') ? null : normalizeRangeYear(match[2] || '');

        if (isInRange(startYear, endYear)) return true;
    }

    const shortRangePattern = /(?:^|\D)(\d{2})\s*-\s*(\d{2}|\.{2,})(?:\D|$)/g;
    while ((match = shortRangePattern.exec(scrubbed))) {
        const startValue = Number.parseInt(match[1], 10);
        const endValue = match[2]?.includes('.') ? null : Number.parseInt(match[2] || '', 10);

        if (startValue > 35 || (endValue !== null && endValue > 35)) continue;

        const startYear = normalizeRangeYear(match[1]);
        const endYear = match[2]?.includes('.') ? null : normalizeRangeYear(match[2] || '');

        if (isInRange(startYear, endYear)) return true;
    }

    return false;
}

function itemMatchesYear(item: CatalogRecord, text: string, year: number) {
    return text.includes(String(year)) || yearMatchesRange(buildRawRecordText(item), year);
}

function uniqueByCodeAndApplication(items: Array<CatalogRecord & { score: number }>) {
    const unique = new Map<string, CatalogRecord & { score: number }>();

    items.forEach((item) => {
        const key = [
            normalizeCode(item.code),
            normalizeText(item.description),
            normalizeText(item.brand || ''),
            normalizeText((item.applications || [])[0] || ''),
        ].join('::');
        const existing = unique.get(key);

        if (!existing || item.score > existing.score) {
            unique.set(key, item);
        }
    });

    return Array.from(unique.values());
}

export class CatalogService {
    private static payload: CatalogPayload[] | null = null;

    private static loadPayload() {
        if (this.payload) return this.payload;

        const catalogFiles = [
            {
                source: 'VDO',
                candidates: [
                    path.resolve(__dirname, '../../catalog/vdo-catalog.json'),
                    path.resolve(__dirname, '../../data/vdo-catalog.json'),
                ],
            },
            {
                source: 'MONROE',
                candidates: [
                    path.resolve(__dirname, '../../catalog/monroe-catalog.json'),
                    path.resolve(__dirname, '../../data/monroe-catalog.json'),
                ],
            },
        ];

        const payloads = catalogFiles.flatMap(({ source, candidates }) => {
            const filePath = candidates.find((candidate) => fs.existsSync(candidate));
            if (!filePath) return [];

            const raw = fs.readFileSync(filePath, 'utf8');
            const payload = JSON.parse(raw) as CatalogPayload;
            payload.items = (payload.items || []).map((item) => ({
                ...item,
                source: item.source || source,
            }));

            return [payload];
        });

        if (payloads.length === 0) {
            throw new Error(`Catalog files not found. Checked: ${catalogFiles.flatMap((item) => item.candidates).join(', ')}`);
        }

        this.payload = payloads;
        return this.payload;
    }

    static search(query: string, limit = 40): CatalogSearchResult[] {
        const payloads = this.loadPayload();
        const normalizedQuery = normalizeText(query);
        const normalizedCodeQuery = normalizeCode(query);

        if (!normalizedQuery || normalizedQuery.length < 2) {
            return [];
        }

        const tokens = normalizedQuery
            .split(/\s+/)
            .filter((token) => token.length >= 2 && !queryStopWords.has(token));
        const years = extractYearTokens(tokens);
        const significantTokens = dedupeContainedTokens(tokens.filter((token) => !years.includes(normalizeYearToken(token) || 0)));
        const looksLikeCodeSearch = /\d/.test(normalizedCodeQuery) && normalizedCodeQuery.length >= 4;

        const allItems = payloads.flatMap((payload) => payload.items || []);
        const scored = allItems
            .map((item) => {
                const text = buildRecordText(item);
                const itemCode = normalizeCode(item.code);
                const codeMatches =
                    looksLikeCodeSearch && (itemCode === normalizedCodeQuery || itemCode.includes(normalizedCodeQuery));
                const tokenMatches = significantTokens.filter((token) => text.includes(token));
                const hasAllTokens = significantTokens.length > 0 && tokenMatches.length === significantTokens.length;
                const hasAllYears = years.every((year) => itemMatchesYear(item, text, year));

                if (!codeMatches && (!hasAllTokens || !hasAllYears)) {
                    return null;
                }

                let score = 0;

                if (itemCode === normalizedCodeQuery) {
                    score += 1000;
                } else if (looksLikeCodeSearch && itemCode.includes(normalizedCodeQuery)) {
                    score += 650;
                }

                const descriptionText = normalizeText(item.description);
                const familyText = normalizeText(item.family || '');
                const categoryText = normalizeText(item.category || '');
                const brandText = normalizeText(item.brand || '');
                const applicationText = normalizeText((item.applications || []).join(' '));

                significantTokens.forEach((token) => {
                    if (descriptionText.includes(token)) score += 80;
                    if (familyText.includes(token)) score += 55;
                    if (applicationText.includes(token)) score += 40;
                    if (brandText.includes(token)) score += 25;
                    if (categoryText.includes(token)) score += 16;
                    if (text.includes(token)) score += 12;
                });

                if (normalizedQuery.length >= 6 && text.includes(normalizedQuery)) score += 120;
                if (years.length > 0) score += years.length * 90;
                if (item.source === 'MONROE') score += 6;

                return {
                    ...item,
                    score,
                };
            })
            .filter((item): item is CatalogRecord & { score: number } => !!item && item.score > 0);

        const deduped = uniqueByCodeAndApplication(scored)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const sourceCompare = String(a.source || '').localeCompare(String(b.source || ''), 'pt-BR');
                if (sourceCompare !== 0) return sourceCompare;
                return String(a.code || '').localeCompare(String(b.code || ''), 'pt-BR');
            })
            .slice(0, limit);

        return deduped.map((item) => ({
            code: item.code,
            description: item.description,
            brand: item.brand || '',
            category: item.category || '',
            family: item.family || '',
            applications: (item.applications || []).slice(0, 8),
            references: (item.references || []).slice(0, 6),
            source: item.source || '',
            score: item.score,
        }));
    }
}
