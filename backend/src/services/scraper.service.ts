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
            
            const promises = suppliers.map(supplier => {
                return new Promise((resolve) => {
                    const supplierJson = Buffer.from(JSON.stringify(supplier)).toString('base64');
                    const command = `node run-search.js --base64 "${supplierJson}" "${productName}"`;
                    
                    exec(command, { cwd: scrapingPath, timeout: 90000 }, (error, stdout, stderr) => {
                        let finalErrorMsg = 'Falha desconhecida no Scraper.';
                        if (error) {
                            console.error(`[Scraper Warning] Falha na execução para ${supplier.name}: `, error ? error.message : 'Timeout');
                            finalErrorMsg = `Timeout ou Erro Crítico: ${error.message}`;
                        }

                        if (stdout) {
                            const match = stdout.match(/RESULTADO_JSON:(.*)/);
                            if (match) {
                                try {
                                    const data = JSON.parse(match[1]);
                                    if (data.length > 0 && !data[0].error) {
                                        resolve(Array.isArray(data) ? data[0] : data);
                                        return;
                                    }
                                    if (data.length > 0 && data[0].error) {
                                        finalErrorMsg = `Erro do Bot: ${data[0].error}`;
                                    }
                                    console.log('[ScraperService] Data parsed but has error or empty:', data);
                                } catch (e) {
                                    console.log('[ScraperService] JSON parse error:', e);
                                    finalErrorMsg = `Erro de Parse JSON.`;
                                }
                            } else {
                                console.log('[ScraperService] No RESULTADO_JSON found in stdout. STDOUT:', stdout);
                                finalErrorMsg = `O robô não finalizou corretamente. Sem output válido.`;
                            }
                        }
                            
                        // Se chegou aqui, é porque falhou em capturar os dados reais
                        resolve({
                            provider: supplier.name,
                            product: productName,
                            price: '---',
                            error: finalErrorMsg,
                            link: supplier.url,
                            available: false
                        });


                        });
                    });
                });

            resultsByProduct[productName] = await Promise.all(promises);
        }

        // Salvar no cache (Opcional, mas útil)
        await prisma.quote.create({
            data: {
                product: productNames.join(', '),
                results: JSON.stringify(resultsByProduct)
            }
        });

        return resultsByProduct;
    }
}
