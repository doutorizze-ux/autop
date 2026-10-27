const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { scrapeProduct } = require('../scraping/engine');

const prisma = new PrismaClient();

async function audit() {
    console.log('=== AUDITORIA COMPLETA DE SESSÕES DOS 9 FORNECEDORES ===');
    const suppliers = await prisma.supplier.findMany({
        where: { websiteSearchEnabled: true },
        select: {
            id: true,
            name: true,
            url: true,
            loginUrl: true,
            needsLogin: true,
            loginCredential: true,
            password: true,
            searchUrl: true,
            sessionData: true
        }
    });

    for (const s of suppliers) {
        console.log(`\n-----------------------------------------`);
        console.log(`Testando: ${s.name}`);
        const t0 = Date.now();
        try {
            const res = await scrapeProduct(s, 'W712');
            const sec = ((Date.now() - t0) / 1000).toFixed(1);
            if (Array.isArray(res) && res.length > 0) {
                console.log(`✅ [OK] ${s.name}: ${res.length} ofertas retornadas em ${sec}s!`);
                console.log(`   Exemplo: ${res[0].product} | R$ ${res[0].price} | Estoque: ${res[0].stockText}`);
            } else if (res && res.error) {
                console.log(`❌ [ERRO] ${s.name} (${sec}s): ${res.error}`);
            } else {
                console.log(`⚠️ [SEM RESULTADO] ${s.name} (${sec}s): 0 ofertas.`);
            }
        } catch (e) {
            const sec = ((Date.now() - t0) / 1000).toFixed(1);
            console.log(`❌ [EXCEPTION] ${s.name} (${sec}s): ${e.message}`);
        }
    }

    await prisma.$disconnect();
}

audit().catch(console.error);
