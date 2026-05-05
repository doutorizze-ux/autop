import path from 'path';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();
const enginePath = path.resolve(__dirname, '../../../scraping/engine.js');
const { scrapeProduct } = require(enginePath);

function normalizeSupplierResults(data: any, supplier: any, productName: string) {
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    const bestByProvider = new Map<string, any>();

    for (const item of data) {
        const provider = String(item?.provider || supplier.name || '').trim() || supplier.name;
        const numericPrice = Number(item?.price) || 0;
        if (!numericPrice) continue;

        const normalizedItem = {
            provider,
            product: item?.product || productName,
            price: item.price,
            available: item?.available ?? true,
            link: item?.link || supplier.url,
            stock: Number.parseInt(String(item?.stock ?? 0), 10) || 0,
            code: item?.code ? String(item.code) : '',
            brand: item?.brand ? String(item.brand) : '',
            application: item?.application ? String(item.application) : '',
        };

        const existing = bestByProvider.get(provider);
        if (!existing || numericPrice < Number(existing.price || 0)) {
            bestByProvider.set(provider, normalizedItem);
        }
    }

    return Array.from(bestByProvider.values());
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
            const bestItem = data.items[0];
            return {
                provider: data.provider || supplier.name,
                product: bestItem.product || bestItem.name || productName,
                price: bestItem.price,
                available: true,
                link: bestItem.link || supplier.url,
                stock: Number.parseInt(String(bestItem.stock ?? 0), 10) || 0,
                code: bestItem.code ? String(bestItem.code) : '',
                brand: bestItem.brand ? String(bestItem.brand) : '',
                application: bestItem.application ? String(bestItem.application) : '',
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

export class ScraperService {
    static async searchSupplierProduct(supplierId: string, productName: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id: supplierId },
        });

        if (!supplier) {
            throw new Error('Fornecedor não encontrado.');
        }

        const result = await runSupplierSearch(supplier, productName);
        return Array.isArray(result) ? result[0] || null : result;
    }

    static async searchMultipleProducts(
        productNames: string[],
        socketId?: string,
        onProgress?: (payload: { supplier: string; productName: string; result: any }) => void,
        shouldCancel?: () => boolean
    ) {
        const suppliers = await prisma.supplier.findMany();
        const concurrency = Math.max(1, Number.parseInt(process.env.SCRAPER_CONCURRENCY || '1', 10) || 1);
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
                    const result = await runSupplierSearch(supplier, productName);
                    const normalizedResults = Array.isArray(result) ? result : [result];

                    for (const entry of normalizedResults) {
                        const progressPayload = {
                            supplier: entry.provider || supplier.name,
                            productName,
                            result: entry,
                        };
                        onProgress?.(progressPayload);
                        if (socketId) {
                            io.to(socketId).emit('quote_progress', progressPayload);
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
