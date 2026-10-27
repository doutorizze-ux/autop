const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const suppliers = await prisma.supplier.findMany({
        where: {
            name: { in: ['Rolemar Master', 'Vespor Pro'] }
        }
    });

    console.log('Novos fornecedores no banco:');
    for (const s of suppliers) {
        console.log(`- ${s.name} (ID: ${s.id})`);
        console.log(`  URL: ${s.url}`);
        console.log(`  Busca ativada: ${s.websiteSearchEnabled}`);
        console.log(`  Sessao salva: ${s.sessionData ? 'SIM (' + s.sessionData.length + ' bytes)' : 'NAO'}`);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
