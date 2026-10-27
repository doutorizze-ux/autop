const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ select: { id: true, email: true, name: true } }).then(console.log).finally(() => prisma.$disconnect());
