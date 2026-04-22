const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.update({
        where: { email: 'admin@autopecas.com' },
        data: { password: hashedPassword }
    });
    console.log('Senha resetada com sucesso para: admin123');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
