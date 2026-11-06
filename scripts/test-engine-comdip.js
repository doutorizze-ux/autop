const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../backend/node_modules/@prisma/client'));
const prisma = new PrismaClient();
const { scrapeProduct } = require(path.resolve(__dirname, '../scraping/engine.js'));

async function test() {
    const supplier = await prisma.supplier.findFirst({
        where: { name: { contains: 'Comdip' } }
    });
    console.log('Testing supplier:', supplier.name);
    console.log('Supplier config:', {
        url: supplier.url,
        loginUrl: supplier.loginUrl,
        searchUrl: supplier.searchUrl,
        loginCredential: supplier.loginCredential
    });

    const result = await scrapeProduct(supplier, 'w712');
    console.log('Scrape result for Comdip:', JSON.stringify(result, null, 2));
    await prisma.$disconnect();
}

test().catch(console.error);
