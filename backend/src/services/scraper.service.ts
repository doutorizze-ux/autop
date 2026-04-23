import { exec } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ScraperService {
    static async searchMultipleProducts(productNames: string[]) {
        const suppliers = await prisma.supplier.findMany();
        const scrapingPath = path.join(__dirname, '../../../scraping');

        const resultsByProduct: Record<string, any[]> = {};

        for (const productName of productNames) {
            console.log(`Buscando em todos os fornecedores para: ${productName}`);

            const promises = suppliers.map((supplier) => {
                return new Promise((resolve) => {
                    const supplierJson = Buffer.from(JSON.stringify(supplier)).toString('base64');
                    const command = `node run-search.js --base64 "${supplierJson}" "${productName}"`;

                    exec(command, { cwd: scrapingPath, timeout: 90000 }, (error, stdout, stderr) => {
                        let finalErrorMsg = 'Falha desconhecida no Scraper.';
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
                                    } else {
                                        finalErrorMsg = 'Nenhum produto encontrado.';
                                    }
                                }
                            } catch (parseError) {
                                console.log('[ScraperService] JSON parse error:', parseError, 'STDOUT:', trimmedStdout);
                                finalErrorMsg = 'Erro de comunicação com o robô.';
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
                                `[Scraper Warning] Falha na execução para ${supplier.name}: code=${error.code ?? 'n/a'} signal=${error.signal ?? 'n/a'} message=${error.message}`
                            );
                            finalErrorMsg = `Timeout ou Erro Crítico. ${finalErrorMsg}`;
                        }

                        resolve({
                            provider: supplier.name,
                            product: productName,
                            price: '---',
                            error: finalErrorMsg,
                            link: supplier.url,
                            available: false,
                        });
                    });
                });
            });

            resultsByProduct[productName] = await Promise.all(promises);
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
