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
                        
                        if (stdout) {
                            try {
                                // Tenta encontrar o JSON no stdout (caso haja algum outro log perdido)
                                const jsonMatch = stdout.match(/\{.*\}/);
                                if (jsonMatch) {
                                    const data = JSON.parse(jsonMatch[0]);
                                    
                                    if (data.items && data.items.length > 0) {
                                        // Mapeia para o formato esperado pelo frontend se necessário
                                        const bestItem = data.items[0];
                                        resolve({
                                            provider: data.provider,
                                            product: bestItem.name,
                                            price: bestItem.price,
                                            available: true,
                                            link: supplier.url
                                        });
                                        return;
                                    } else if (data.error) {
                                        finalErrorMsg = `Erro do Bot: ${data.error}`;
                                    } else {
                                        finalErrorMsg = `Nenhum produto encontrado.`;
                                    }
                                }
                            } catch (e) {
                                console.log('[ScraperService] JSON parse error:', e, 'STDOUT:', stdout);
                                finalErrorMsg = `Erro de comunicação com o robô.`;
                            }
                        }

                        if (error) {
                            console.error(`[Scraper Warning] Falha na execução para ${supplier.name}: `, error.message);
                            finalErrorMsg = `Timeout ou Erro Crítico.`;
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
