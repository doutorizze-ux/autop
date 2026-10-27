const { scrapeProduct } = require('../scraping/engine');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function testBoth() {
    console.log('=== TESTE DE RESISTENCIA CLOUDFLARE: ROLEMAR & VESPOR ===');

    const rolemar = await prisma.supplier.findFirst({ where: { name: 'Rolemar Master' } });
    const vespor = await prisma.supplier.findFirst({ where: { name: 'Vespor Pro' } });

    console.log('\n[1/2] Testando Rolemar Master...');
    const t0 = Date.now();
    const r1 = await scrapeProduct(rolemar, 'W712');
    const s1 = ((Date.now() - t0) / 1000).toFixed(1);
    if (Array.isArray(r1) && r1.length > 0) {
        console.log(`✅ Rolemar Master SUCESSO: ${r1.length} ofertas retornadas em ${s1}s sem bloqueio Cloudflare!`);
        console.log(`   Exemplo: ${r1[0].product} | R$ ${r1[0].price} | Estoque: ${r1[0].stockText}`);
    } else {
        console.log(`❌ Rolemar Master FALHA:`, r1);
    }

    console.log('\n[2/2] Testando Vespor Pro...');
    const t1 = Date.now();
    const r2 = await scrapeProduct(vespor, 'W712');
    const s2 = ((Date.now() - t1) / 1000).toFixed(1);
    if (Array.isArray(r2) && r2.length > 0) {
        console.log(`✅ Vespor Pro SUCESSO: ${r2.length} ofertas retornadas em ${s2}s sem bloqueio Cloudflare!`);
        console.log(`   Exemplo: ${r2[0].product} | R$ ${r2[0].price} | Estoque: ${r2[0].stockText}`);
    } else {
        console.log(`❌ Vespor Pro FALHA:`, r2);
    }

    await prisma.$disconnect();
    console.log('\n=== FIM DO TESTE ===');
}

testBoth().catch(console.error);
