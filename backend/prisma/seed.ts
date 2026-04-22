import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const password = await bcrypt.hash('123456', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@autopecas.com' },
        update: { password },
        create: {
            name: 'Admin Master',
            email: 'admin@autopecas.com',
            password,
            role: 'ADMIN'
        }
    });

    const func = await prisma.user.upsert({
        where: { email: 'func@autopecas.com' },
        update: {},
        create: {
            name: 'Funcionario',
            email: 'func@autopecas.com',
            password,
            role: 'FUNCIONARIO'
        }
    });

    console.log({ admin, func });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
