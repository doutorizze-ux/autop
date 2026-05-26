import path from 'path';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';
import { LocalAgentService } from './local-agent.service';

const prisma = new PrismaClient();
const enginePath = path.resolve(__dirname, '../../../scraping/engine.js');
const { scrapeProduct } = require(enginePath);

type CacheEntry = {
    expiresAt: number;
    value: any;
};

const supplierSearchCache = new Map<string, CacheEntry>();

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isResultCacheEnabled() {
    return String(process.env.SCRAPER_RESULT_CACHE_ENABLED || '').trim().toLowerCase() === 'true';
}

function clonePayload<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value));
}

function getSupplierCacheKey(supplier: any, productName: string) {
    const supplierVersion = supplier.updatedAt instanceof Date
        ? supplier.updatedAt.toISOString()
        : String(supplier.updatedAt || '');

    return [
        supplier.id || supplier.name,
        supplierVersion,
        normalizeVariantKey(productName),
    ].join('::');
}

function isCacheableSearchResult(result: any) {
    if (Array.isArray(result)) {
        return result.length > 0 && result.some((entry) => entry && !entry.error);
    }

    if (result?.items) {
        return Array.isArray(result.items) && result.items.length > 0;
    }

    return Boolean(result && !result.error && result.price && result.price !== '---');
}

function pruneSearchCache() {
    const now = Date.now();
    for (const [key, entry] of supplierSearchCache.entries()) {
        if (entry.expiresAt <= now) {
            supplierSearchCache.delete(key);
        }
    }

    const maxEntries = parsePositiveInt(process.env.SCRAPER_CACHE_MAX_ENTRIES, 500);
    while (supplierSearchCache.size > maxEntries) {
        const oldestKey = supplierSearchCache.keys().next().value;
        if (!oldestKey) break;
        supplierSearchCache.delete(oldestKey);
    }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            operation,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function normalizeVariantKey(value: string) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeCodeLike(value: string) {
    return String(value || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '');
}

function parsePriceNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const raw = String(value ?? '').trim();
    if (!raw || /^-+$/.test(raw)) return 0;

    const match = raw.match(/([0-9.,]+)/);
    if (!match) return 0;

    const normalized = match[1].replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAvailabilityText(value: unknown) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isPackagingQuantityText(value: unknown) {
    const text = normalizeAvailabilityText(value);
    return /\bquantidade\s+por\s+embalagem\b|\bqtd\.?\s+por\s+embalagem\b|\bembalagem\b/.test(text);
}

function hasUnavailableSignal(value: unknown) {
    const text = normalizeAvailabilityText(value);
    if (!text) return false;

    return (
        /\bfora\s+de\s+estoque\b/.test(text) ||
        /\bsem\s+estoque\b/.test(text) ||
        /\bindisponivel\b/.test(text) ||
        /\bnao\s+disponivel\b/.test(text) ||
        /\besgotad[oa]\b/.test(text) ||
        /\bavise\s*[- ]?me\b/.test(text) ||
        /\bout\s+of\s+stock\b/.test(text) ||
        /\bunavailable\b/.test(text) ||
        /(?:estoque|saldo|disponivel|disponibilidade)\D{0,20}\b0\b/.test(text)
    );
}

function parseStockValue(stock: unknown, stockText: unknown) {
    if (isPackagingQuantityText(stockText)) return 0;
    const parsed = Number.parseInt(String(stock ?? 0), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isUnavailableResult(item: any) {
    const rawText = [
        item?.stockText,
        item?.estoqueTexto,
        item?.availability,
        item?.disponibilidade,
        item?.fullText,
        item?.textoCompleto,
    ].filter(Boolean).join(' ');

    return item?.available === false || item?.disponivel === false || hasUnavailableSignal(rawText);
}

function isGenericProductName(product: unknown, supplierName: unknown) {
    const productText = normalizeVariantKey(String(product || ''));
    const supplierText = normalizeVariantKey(String(supplierName || ''));
    if (!productText) return true;

    const genericNames = [
        'produto',
        'produto fornecedor',
        'produto real moto pecas',
        supplierText ? `produto ${supplierText}` : '',
    ].filter(Boolean);

    return genericNames.includes(productText) || productText === supplierText;
}

function hasReliableProductIdentity(item: any, supplier: any, productName: string) {
    const product = String(item?.product || item?.nome || item?.name || '').trim();
    const code = normalizeCodeLike(item?.code || item?.codigo || '');
    const queryCode = normalizeCodeLike(productName);
    const brand = normalizeVariantKey(item?.brand || item?.marca || '');
    const application = normalizeVariantKey(item?.application || item?.aplicacao || '');
    const productKey = normalizeVariantKey(product);
    const queryKey = normalizeVariantKey(productName);

    if (code) return true;
    if (isGenericProductName(product, supplier?.name)) return false;
    if (queryKey && productKey === queryKey && !brand && !application) return false;
    return productKey.length >= 4 || Boolean(brand || application);
}

function getResultRelevance(item: any, productName: string) {
    const rawQuery = String(productName || '').trim();
    const queryText = normalizeVariantKey(productName);
    const queryCode = normalizeCodeLike(productName);
    const itemCode = normalizeCodeLike(item?.code || '');
    const itemProduct = normalizeVariantKey(item?.product || '');

    const looksLikeCode = /^[A-Za-z0-9./_-]{3,}$/.test(rawQuery) && !/\s/.test(rawQuery);

    if (looksLikeCode) {
        if (itemCode && itemCode === queryCode) return 0;
        if (itemCode && itemCode.startsWith(queryCode)) return 1;
        if (itemCode && itemCode.includes(queryCode)) return 2;
        if (itemProduct && itemProduct.includes(queryText)) return 3;
        return 4;
    }

    if (itemProduct && itemProduct === queryText) return 0;
    if (itemProduct && itemProduct.includes(queryText)) return 1;
    if (itemCode && itemCode.includes(queryCode) && queryCode) return 2;
    return 3;
}

function buildResultIdentity(item: any) {
    const provider = String(item?.provider || '').trim();
    const variantKey = normalizeVariantKey(item?.variantKey || `${item?.product || ''} ${item?.application || ''}`);
    const brand = normalizeVariantKey(item?.brand || '');
    const code = normalizeVariantKey(item?.code || '');
    return [provider, variantKey, brand, code].join('::');
}

function normalizeSupplierResults(data: any, supplier: any, productName: string) {
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    const bestByIdentity = new Map<string, any>();

    for (const item of data) {
        const provider = String(item?.provider || supplier.name || '').trim() || supplier.name;
        const numericPrice = parsePriceNumber(item?.price);
        if (!numericPrice) continue;
        if (isUnavailableResult(item)) continue;
        if (!hasReliableProductIdentity(item, supplier, productName)) continue;

        const stockText = item?.stockText ? String(item.stockText) : '';
        const normalizedItem = {
            provider,
            product: item?.product || productName,
            price: numericPrice,
            available: true,
            link: item?.link || supplier.url,
            stock: parseStockValue(item?.stock, stockText),
            stockText,
            code: item?.code ? String(item.code) : '',
            brand: item?.brand ? String(item.brand) : '',
            application: item?.application ? String(item.application) : '',
            variantKey: String(item?.variantKey || `${item?.product || productName}|${item?.application || ''}`),
        };

        const identity = buildResultIdentity(normalizedItem);
        const existing = bestByIdentity.get(identity);
        if (!existing || numericPrice < Number(existing.price || 0)) {
            bestByIdentity.set(identity, normalizedItem);
        }
    }

    return Array.from(bestByIdentity.values()).sort((a, b) => {
        const relevanceCompare = getResultRelevance(a, productName) - getResultRelevance(b, productName);
        if (relevanceCompare !== 0) return relevanceCompare;

        const productCompare = String(a.product || '').localeCompare(String(b.product || ''), 'pt-BR');
        if (productCompare !== 0) return productCompare;

        const applicationCompare = String(a.application || '').localeCompare(String(b.application || ''), 'pt-BR');
        if (applicationCompare !== 0) return applicationCompare;

        return Number(a.price || 0) - Number(b.price || 0);
    });
}

export async function runSupplierSearch(supplier: any, productName: string) {
    try {
        const data = await scrapeProduct(supplier, productName);

        if (Array.isArray(data) && data.length > 0) {
            const normalizedItems = normalizeSupplierResults(data, supplier, productName);
            if (normalizedItems.length === 1) {
                return normalizedItems[0];
            }
            if (normalizedItems.length > 1) {
                return normalizedItems;
            }
        }

        if (data && data.items && data.items.length > 0) {
            const normalizedItems = normalizeSupplierResults(data.items, supplier, productName);
            const bestItem = normalizedItems[0];
            if (!bestItem) {
                return {
                    provider: data.provider || supplier.name,
                    product: productName,
                    price: '---',
                    error: 'Fornecedor retornou apenas item indisponivel ou sem preco valido.',
                    link: supplier.url,
                    available: false,
                    debug: null,
                };
            }

            return {
                provider: data.provider || supplier.name,
                product: bestItem.product || productName,
                price: bestItem.price,
                available: true,
                link: bestItem.link || supplier.url,
                stock: parseStockValue(bestItem.stock, bestItem.stockText),
                stockText: bestItem.stockText ? String(bestItem.stockText) : '',
                code: bestItem.code ? String(bestItem.code) : '',
                brand: bestItem.brand ? String(bestItem.brand) : '',
                application: bestItem.application ? String(bestItem.application) : '',
                variantKey: String(bestItem.variantKey || `${bestItem.product || bestItem.name || productName}|${bestItem.application || ''}`),
            };
        }

        if (data && data.error) {
            let errorMsg = data.error;
            const debugTitle = String(data.debug?.pageTitle || '');
            const debugSnippet = String(data.debug?.bodySnippet || '');
            const debugUrl = String(data.debug?.finalUrl || '');
            const debugContext = `${debugTitle}\n${debugSnippet}\n${debugUrl}`.toLowerCase();

            if (
                debugContext.includes('request could not be satisfied') ||
                debugContext.includes('403 error') ||
                debugContext.includes('cloudfront') ||
                debugContext.includes('request blocked')
            ) {
                errorMsg = 'Erro do Bot: Acesso bloqueado pelo site (CloudFront/403).';
            } else
            if (
                errorMsg.includes('Sessão manual inválida') ||
                errorMsg.includes('Sessao manual invalida') ||
                errorMsg.includes('Falha no login') ||
                errorMsg.includes('credenciais recusadas')
            ) {
                errorMsg = 'Sessão expirada ou login bloqueado. Refaça o Login Assistido deste fornecedor.';
            } else if (errorMsg.includes('Nenhum produto encontrado') || errorMsg.includes('Nenhum item')) {
                errorMsg = 'Não encontrado nesta consulta. Preço/estoque não confirmado.';
            } else if (!errorMsg.startsWith('Erro do Bot')) {
                errorMsg = `Erro do Bot: ${data.error}`;
            }

            return {
                provider: supplier.name,
                product: productName,
                price: '---',
                error: errorMsg,
                link: supplier.url,
                available: false,
                debug: data.debug || null,
            };
        }

        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: 'Erro do Bot: Nenhum retorno válido do fornecedor.',
            link: supplier.url,
            available: false,
            debug: null,
        };

    } catch (error: any) {
        console.error(`[Scraper Warning] Falha na execução para ${supplier.name}: message=${error.message}`);
        
        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro crítico. ${error.message || 'Falha desconhecida.'}`,
            link: supplier.url,
            available: false,
            debug: null,
        };
    }
}

async function executeSupplierSearch(supplier: any, productName: string) {
    const localAgentEnabled = process.env.LOCAL_AGENT_MODE !== 'disabled';
    const useLocalAgent = localAgentEnabled && LocalAgentService.hasActiveAgentsForSupplier(supplier);
    if (useLocalAgent) {
        try {
            return await LocalAgentService.dispatchSearchTask(supplier, productName);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const allowServerFallback = process.env.LOCAL_AGENT_FALLBACK_ON_FAILURE === 'true';
            console.error(`[Local Agent] Falha para ${supplier.name}: ${message}`);

            if (!allowServerFallback) {
                return {
                    provider: supplier.name,
                    product: productName,
                    price: '---',
                    error: `Erro do Bot: Agente local falhou para ${supplier.name}. ${message}`,
                    link: supplier.url,
                    available: false,
                    debug: null,
                };
            }

            console.error(`[Local Agent] Fallback no servidor habilitado para ${supplier.name}.`);
        }
    }

    if (localAgentEnabled && process.env.LOCAL_AGENT_REQUIRE_FOR_SEARCH === 'true') {
        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro do Bot: Nenhum agente local online para ${supplier.name}.`,
            link: supplier.url,
            available: false,
            debug: null,
        };
    }

    return runSupplierSearch(supplier, productName);
}

async function executeSupplierSearchWithGuards(supplier: any, productName: string) {
    const cacheEnabled = isResultCacheEnabled();
    const cacheTtlMs = cacheEnabled ? parseNonNegativeInt(process.env.SCRAPER_CACHE_TTL_MS, 0) : 0;
    const timeoutMs = parsePositiveInt(process.env.SCRAPER_SUPPLIER_TIMEOUT_MS, 165_000);
    const cacheKey = getSupplierCacheKey(supplier, productName);
    const cached = cacheEnabled ? supplierSearchCache.get(cacheKey) : null;

    if (cached && cached.expiresAt > Date.now()) {
        return clonePayload(cached.value);
    }

    if (cached) {
        supplierSearchCache.delete(cacheKey);
    } else if (!cacheEnabled && supplierSearchCache.size > 0) {
        supplierSearchCache.clear();
    }

    let result;
    try {
        result = await withTimeout(
            executeSupplierSearch(supplier, productName),
            timeoutMs,
            `${supplier.name} (${productName})`
        );
    } catch (error: any) {
        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro do Bot: ${error?.message || 'Fornecedor excedeu o tempo limite.'}`,
            link: supplier.url,
            available: false,
            debug: null,
        };
    }

    if (isCacheableSearchResult(result) && cacheTtlMs > 0) {
        pruneSearchCache();
        supplierSearchCache.set(cacheKey, {
            expiresAt: Date.now() + cacheTtlMs,
            value: clonePayload(result),
        });
    }

    return result;
}

function normalizeSearchResultPayload(result: any, supplier: any, productName: string) {
    if (Array.isArray(result)) {
        const normalizedItems = normalizeSupplierResults(result, supplier, productName);
        return normalizedItems.length <= 1 ? (normalizedItems[0] || null) : normalizedItems;
    }

    return result;
}

export class ScraperService {
    static async searchSupplierProduct(supplierId: string, productName: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id: supplierId },
        });

        if (!supplier) {
            throw new Error('Fornecedor não encontrado.');
        }

        if ((supplier as any).websiteSearchEnabled === false) {
            return {
                provider: supplier.name,
                product: productName,
                price: '---',
                available: false,
                stockText: 'Busca por site/agente local desativada para este fornecedor.',
                link: supplier.url,
            };
        }

        const result = await executeSupplierSearchWithGuards(supplier, productName);
        const normalized = normalizeSearchResultPayload(result, supplier, productName);
        return Array.isArray(normalized) ? normalized[0] || null : normalized;
    }

    static async searchMultipleProducts(
        productNames: string[],
        progressRoom?: string,
        progressContext: Record<string, any> = {},
        onProgress?: (payload: { supplier: string; productName: string; result: any }) => void,
        shouldCancel?: () => boolean
    ) {
        const suppliers = (await prisma.supplier.findMany()).filter((supplier: any) => supplier.websiteSearchEnabled !== false);
        const concurrency = Math.max(1, Number.parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10) || 3);
        const resultsByProduct: Record<string, any[]> = {};

        for (const productName of productNames) {
            if (shouldCancel?.()) break;
            console.log(`Buscando em todos os fornecedores para: ${productName}`);

            const productResults: any[] = [];
            for (let index = 0; index < suppliers.length; index += concurrency) {
                if (shouldCancel?.()) break;
                const currentBatch = suppliers.slice(index, index + concurrency);
                const batchResults = await Promise.all(currentBatch.map(async (supplier) => {
                    if (shouldCancel?.()) {
                        return {
                            provider: supplier.name,
                            product: productName,
                            price: '---',
                            error: 'Orçamento cancelado pelo usuário.',
                            link: supplier.url,
                            available: false,
                            debug: null,
                        };
                    }
                    const result = await executeSupplierSearchWithGuards(supplier, productName);
                    const normalizedPayload = normalizeSearchResultPayload(result, supplier, productName);
                    const normalizedResults = Array.isArray(normalizedPayload) ? normalizedPayload : [normalizedPayload];

                    for (const entry of normalizedResults) {
                        const progressPayload = {
                            supplier: entry.provider || supplier.name,
                            productName,
                            result: entry,
                        };
                        onProgress?.(progressPayload);
                        if (progressRoom) {
                            io.to(progressRoom).emit('quote_progress', {
                                ...progressPayload,
                                ...progressContext,
                            });
                        }
                    }
                    return normalizedResults;
                }));
                productResults.push(...batchResults.flat());
            }

            resultsByProduct[productName] = productResults;
        }

        return resultsByProduct;
    }
}
