import { exec } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scrapingPath = path.join(__dirname, '../../../scraping');

function readPositiveIntEnv(name: string, fallback: number, minimum = 1) {
    const rawValue = process.env[name];
    const parsedValue = Number.parseInt(rawValue || '', 10);

    if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
        return fallback;
    }

    return parsedValue;
}

function runSupplierSearch(supplier: any, productName: string) {
    return new Promise<any>((resolve) => {
        const supplierJson = Buffer.from(JSON.stringify(supplier)).toString('base64');
        const command = `node run-search.js --base64 "${supplierJson}" "${productName}"`;
        const timeoutMs = readPositiveIntEnv('SCRAPER_TIMEOUT_MS', 45000, 15000);

        exec(command, { cwd: scrapingPath, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            let finalErrorMsg = 'Falha desconhecida no Scraper.';
            let debugData: any = null;
            const trimmedStdout = stdout?.trim();
            const trimmedStderr = stderr?.trim();

            if (trimmedStdout) {
                try {
                    const jsonMatch = trimmedStdout.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);

                    if (jsonMatch) {
                        const data = JSON.parse(jsonMatch[0]);

                        if (Array.isArray(data) && data.length > 0) {
                            const bestItem = data[0];
                            resolve({
                                provider: bestItem.provider || supplier.name,
                                product: bestItem.product || productName,
                                price: bestItem.price,
                                available: true,
                                link: bestItem.link || supplier.url,
                            });
                            return;
                        }

                        if (data.items && data.items.length > 0) {
                            const bestItem = data.items[0];
                            resolve({
                                provider: data.provider || supplier.name,
                                product: bestItem.product || bestItem.name || productName,
                                price: bestItem.price,
                                available: true,
                                link: bestItem.link || supplier.url,
                            });
                            return;
                        }

                        if (data.error) {
                            finalErrorMsg = `Erro do Bot: ${data.error}`;
                            debugData = data.debug || null;
                        } else {
                            finalErrorMsg = 'Nenhum produto encontrado.';
                        }
                    }
                } catch (parseError) {
                    console.log('[ScraperService] JSON parse error:', parseError, 'STDOUT:', trimmedStdout);
                    finalErrorMsg = 'Erro de comunicacao com o robo.';
                }
            }

            if (trimmedStderr) {
                console.error(`[Scraper STDERR] ${supplier.name}: ${trimmedStderr}`);
            }

            if (error && trimmedStdout) {
                console.error(`[Scraper STDOUT] ${supplier.name}: ${trimmedStdout}`);
            }

            if (error) {
                console.error(
                    `[Scraper Warning] Falha na execucao para ${supplier.name}: timeout=${timeoutMs} code=${error.code ?? 'n/a'} signal=${error.signal ?? 'n/a'} message=${error.message}`
                );
                finalErrorMsg = `Timeout ou Erro Critico. ${finalErrorMsg}`;
            }

            resolve({
                provider: supplier.name,
                product: productName,
                price: '---',
                error: finalErrorMsg,
                link: supplier.url,
                available: false,
                debug: debugData,
            });
        });
    });
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
        const concurrency = readPositiveIntEnv('SCRAPER_CONCURRENCY', 2, 1);
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
