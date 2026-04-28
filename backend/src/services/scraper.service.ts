import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const enginePath = path.resolve(__dirname, '../../../scraping/engine.js');
const { scrapeProduct } = require(enginePath);

async function runSupplierSearch(supplier: any, productName: string) {
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
            return {
                provider: supplier.name,
                product: productName,
                price: '---',
                error: `Erro do Bot: ${data.error}`,
                link: supplier.url,
                available: false,
                debug: data.debug || null,
            };
        }

        return {
            provider: supplier.name,
            product: productName,
            price: '---',
            error: 'Nenhum produto encontrado.',
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

    static async searchMultipleProducts(productNames: string[]) {
        const suppliers = await prisma.supplier.findMany();
        const concurrency = Math.max(1, Number.parseInt(process.env.SCRAPER_CONCURRENCY || '1', 10) || 1);
        const resultsByProduct: Record<string, any[]> = {};

        for (const productName of productNames) {
            console.log(`Buscando em todos os fornecedores para: ${productName}`);

            const productResults: any[] = [];
            for (let index = 0; index < suppliers.length; index += concurrency) {
                const currentBatch = suppliers.slice(index, index + concurrency);
                const batchResults = await Promise.all(currentBatch.map((supplier) => runSupplierSearch(supplier, productName)));
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
