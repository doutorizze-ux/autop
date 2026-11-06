const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../backend/node_modules/@prisma/client'));
const prisma = new PrismaClient();
const { runSupplierSearch } = require(path.resolve(__dirname, '../backend/dist/services/scraper.service.js'));

async function testBoth() {
    const rolemar = await prisma.supplier.findFirst({ where: { name: { contains: 'Rolemar' } } });
    console.log('Testing search for Rolemar...');
    const resRolemar = await runSupplierSearch(rolemar, 'w712');
    console.log('Rolemar RESULT items count:', Array.isArray(resRolemar) ? resRolemar.length : (resRolemar ? 1 : 0));
    if (Array.isArray(resRolemar) && resRolemar[0]) {
        console.log('Rolemar first item:', resRolemar[0]);
    } else {
        console.log('Rolemar single result:', resRolemar);
    }

    const comdip = await prisma.supplier.findFirst({ where: { name: { contains: 'Comdip' } } });
    console.log('Testing search for Comdip...');
    const resComdip = await runSupplierSearch(comdip, 'w712');
    console.log('Comdip RESULT items count:', Array.isArray(resComdip) ? resComdip.length : (resComdip ? 1 : 0));
    if (Array.isArray(resComdip) && resComdip[0]) {
        console.log('Comdip first item:', resComdip[0]);
    } else {
        console.log('Comdip single result:', resComdip);
    }

    await prisma.$disconnect();
}

testBoth().catch(console.error);
