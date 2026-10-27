const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const raw = fs.readFileSync('scraping/sessions/dpk.json', 'utf8');
    await prisma.supplier.updateMany({
        where: { name: { contains: 'DPK' } },
        data: { sessionData: raw }
    });
    console.log('DPK updated in DB!');
    await prisma.$disconnect();
}

main().catch(console.error);
