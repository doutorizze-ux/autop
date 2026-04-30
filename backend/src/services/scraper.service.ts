import path from 'path';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';

const prisma = new PrismaClient();
const enginePath = path.resolve(__dirname, '../../../scraping/engine.js');
const { scrapeProduct } = require(enginePath);

async function runSupplierSearch(supplier: any, productName: string) {
    console.error(`[BACKEND_VERSION] Executing scraper engine v3 (branch: main) for: ${supplier.name}`);
    try {
        const supplierTimeoutMs = Math.max(
            10000,
            Number.parseInt(process.env.SCRAPER_SUPPLIER_TIMEOUT_MS || '70000', 10) || 70000
        );
        const data = await scrapeProduct({ ...supplier, scraperTimeoutMs: supplierTimeoutMs }, productName);

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
            if (errorMsg.includes('Nenhum produto encontrado') || errorMsg.includes('Nenhum item')) {
                errorMsg = 'Nao ha este produto no estoque';
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

    static async searchMultipleProducts(productNames: string[], socketId?: string) {
        const suppliers = await prisma.supplier.findMany();
        const concurrency = Math.max(1, Number.parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10) || 3);
        const resultsByProduct: Record<string, any[]> = {};

        for (const productName of productNames) {
            console.log(`Buscando em todos os fornecedores para: ${productName}`);

            const productResults: any[] = [];
            for (let index = 0; index < suppliers.length; index += concurrency) {
                const currentBatch = suppliers.slice(index, index + concurrency);
                const batchResults = await Promise.all(currentBatch.map(async (supplier) => {
                    const result = await runSupplierSearch(supplier, productName);
                    if (socketId) {
                        io.to(socketId).emit('quote_progress', {
                            supplier: supplier.name,
                            productName,
                            result
                        });
                    }
                    return result;
                }));
                productResults.push(...batchResults);
            }

            resultsByProduct[productName] = productResults;
        }

        await prisma.quote.create({
            data: {
                product: productNames.join(', '),
                results: JSON.stringify(resultsByProduct),
            },
        });

        return resultsByProduct;
    }
}
