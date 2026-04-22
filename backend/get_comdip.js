const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.supplier.findMany();
  console.log(c.map(s => s.name + " | " + s.url + " | " + s.loginCredential));
  await prisma.$disconnect();
}
run();
