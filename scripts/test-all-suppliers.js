const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { scrapeProduct } = require('../scraping/engine');

const prisma = new PrismaClient();

async function main() {
    console.log('=== TESTE DOS 9 FORNECEDORES CONECTADOS ===\n');
    const suppliers = await prisma.supplier.findMany({
        where: { websiteSearchEnabled: true },
        select: {
            id: true,
            name: true,
            url: true,
            needsLogin: true,
            loginUrl: true,
            loginUserSelector: true,
            loginPassSelector: true,
            loginSubmitSelector: true,
            loginCredential: true,
            password: true,
            searchUrl: true,
            searchBarSelector: true,
            searchBtnSelector: true,
            itemContainerSelector: true,
            productNameSelector: true,
            priceSelector: true,
            availableSelector: true,
            sessionData: true
        }
    });

    console.log(`Encontrados ${suppliers.length} fornecedores com websiteSearchEnabled: true.\n`);

    const query = 'W712';
    const summary = [];

    const promises = suppliers.map(async (supplier) => {
        const start = Date.now();
        try {
            console.log(`[START] Iniciando busca em: ${supplier.name}...`);
            const results = await scrapeProduct(supplier, query);
            const duration = ((Date.now() - start) / 1000).toFixed(1);
            if (Array.isArray(results) && results.length > 0) {
                console.log(`[SUCCESS] ${supplier.name}: ${results.length} ofertas retornadas em ${duration}s! (Exemplo: ${results[0].product} - R$ ${results[0].price})`);
                summary.push({ name: supplier.name, status: 'OK', count: results.length, duration: `${duration}s`, sample: `${results[0].product} - R$ ${results[0].price}` });
            } else if (results && results.error) {
                console.log(`[ERROR] ${supplier.name}: ${results.error}`);
                summary.push({ name: supplier.name, status: 'ERRO', error: results.error, duration: `${duration}s` });
            } else {
                console.log(`[EMPTY] ${supplier.name}: 0 ofertas em ${duration}s.`);
                summary.push({ name: supplier.name, status: 'VAZIO', count: 0, duration: `${duration}s` });
            }
        } catch (e) {
            const duration = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`[EXCEPTION] ${supplier.name}: ${e.message}`);
            summary.push({ name: supplier.name, status: 'EXCECAO', error: e.message, duration: `${duration}s` });
        }
    });

    await Promise.all(promises);

    console.log('\n=== RESUMO GERAL DAS COTAÇÕES ===');
    console.table(summary);
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(console.error);
