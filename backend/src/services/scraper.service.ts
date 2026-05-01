import path from 'path';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();
const enginePath = path.resolve(__dirname, '../../../scraping/engine.js');
const { scrapeProduct } = require(enginePath);

export async function runSupplierSearch(supplier: any, productName: string) {
    try {
        const data = await scrapeProduct(supplier, productName);

        if (Array.isArray(data) && data.length > 0) {
            const bestItem = data[0];
            return {
                provider: bestItem.provider || supplier.name,
                product: bestItem.product || productName,
                price: bestItem.price,
                available: true,
                link: bestItem.link || supplier.url,
            };
        }

        if (data && data.items && data.items.length > 0) {
            const bestItem = data.items[0];
            return {
                provider: data.provider || supplier.name,
                product: bestItem.product || bestItem.name || productName,
                price: bestItem.price,
                available: true,
                link: bestItem.link || supplier.url,
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
                errorMsg.includes('Sessao manual invalida') ||
                errorMsg.includes('Falha no login') ||
                errorMsg.includes('credenciais recusadas')
            ) {
                errorMsg = 'Sessao expirada ou login bloqueado. Refaça o Login Assistido deste fornecedor.';
            } else if (errorMsg.includes('Nenhum produto encontrado') || errorMsg.includes('Nenhum item')) {
                errorMsg = 'Nao encontrado nesta consulta. Preco/estoque nao confirmado.';
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
            error: 'Erro do Bot: Nenhum retorno valido do fornecedor.',
            link: supplier.url,
            available: false,
            debug: null,
        };

    } catch (error: any) {
        console.error(`[Scraper Warning] Falha na execucao para ${supplier.name}: message=${error.message}`);
        
        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: `Erro Critico. ${error.message || 'Falha desconhecida.'}`,
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
            throw new Error('Fornecedor nao encontrado.');
        }

        return runSupplierSearch(supplier, productName);
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
                            error: 'Orcamento cancelado pelo usuario.',
                            link: supplier.url,
                            available: false,
                            debug: null,
                        };
                    }
                    const result = await runSupplierSearch(supplier, productName);
                    const progressPayload = {
                        supplier: supplier.name,
                        productName,
                        result
                    };
                    onProgress?.(progressPayload);
                    if (socketId) {
                        io.to(socketId).emit('quote_progress', progressPayload);
                    }
                    return result;
                }));
                productResults.push(...batchResults);
            }

            resultsByProduct[productName] = productResults;
        }

        return resultsByProduct;
    }
}
