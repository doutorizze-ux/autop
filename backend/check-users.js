const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    console.log('USERS_FOUND:' + JSON.stringify(users));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
