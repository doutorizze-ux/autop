const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../backend/node_modules/@prisma/client'));
const prisma = new PrismaClient();
const { scrapeProduct } = require(path.resolve(__dirname, '../scraping/engine.js'));

async function test() {
    const supplier = await prisma.supplier.findFirst({
        where: { name: { contains: 'Rolemar' } }
    });
    console.log('Testing supplier:', supplier.name);
    console.log('Supplier details:', {
        searchUrl: supplier.searchUrl,
        loginCredential: supplier.loginCredential,
        url: supplier.url
    });

    const result = await scrapeProduct(supplier, 'w712');
    console.log('Scrape result:', JSON.stringify(result, null, 2));
    await prisma.$disconnect();
}

test().catch(console.error);
