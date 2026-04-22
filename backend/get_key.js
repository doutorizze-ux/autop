const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.systemConfig.findUnique({ where: { id: 'system_settings' } });
  console.log('CONFIG:', JSON.stringify(config, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
