const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const path = require('path');

const prisma = new PrismaClient();
prisma.supplier.findFirst({ where: { name: 'Furacão Auto Peças' } }).then(supplier => {
    if (!supplier) return console.log('Supplier not found');
    const supplierJson = Buffer.from(JSON.stringify(supplier)).toString('base64');
    const scrapingPath = path.join(__dirname, 'scraping');
    exec(`node run-search.js --base64 "${supplierJson}" "341439"`, { cwd: scrapingPath }, (e, stdout) => {
        console.log('ERROR:', e ? e.message : 'null');
        console.log('STDOUT:', stdout);
        prisma.$disconnect();
    });
});
