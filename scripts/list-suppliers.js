const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const suppliers = await prisma.supplier.findMany({
        select: {
            id: true,
            name: true,
            websiteSearchEnabled: true,
            type: true,
            url: true
        }
    });
    console.log(`Total de fornecedores cadastrados: ${suppliers.length}`);
    console.table(suppliers);
    await prisma.$disconnect();
}

main().catch(console.error);
