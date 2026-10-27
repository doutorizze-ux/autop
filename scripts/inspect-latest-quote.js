const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const q = await prisma.quote.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!q) {
        console.log('Nenhuma cotação salva.');
        return;
    }
    const parsed = JSON.parse(q.results);
    console.log('ID:', q.id);
    console.log('Item pesquisado:', q.product);
    console.log('Criado em:', q.createdAt);
    console.log('Fornecedores no resultado:');
    for (const [query, res] of Object.entries(parsed.matrix || {})) {
        console.log(`\nConsulta: "${query}"`);
        for (const item of res) {
            const status = item.available ? `✅ ACHOU: ${item.product} (R$ ${item.price})` : `❌ NÃO ACHOU (${item.error || 'sem oferta'})`;
            console.log(`  - ${item.provider}: ${status}`);
        }
    }
    await prisma.$disconnect();
}

main().catch(console.error);
