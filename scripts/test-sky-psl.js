const { scrapeProduct } = require('../scraping/engine');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function testSky() {
    const sky = await prisma.supplier.findFirst({ where: { name: { contains: 'Sky' } } });
    console.log('Testing Sky with PSL560...');
    const r = await scrapeProduct(sky, 'PSL560');
    console.log('Sky count:', Array.isArray(r) ? r.length : r);
    if (Array.isArray(r) && r.length > 0) {
        console.log('Oferta 1:', r[0]);
    }
    await prisma.$disconnect();
}

testSky().catch(console.error);
