const { chromium } = require('../scraping/node_modules/playwright');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const comdipSupplier = require('../scraping/suppliers/comdip');
const fs = require('fs');
const prisma = new PrismaClient();

async function saveComdipSession() {
    const supplier = await prisma.supplier.findFirst({ where: { name: { contains: 'Comdip' } } });
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    console.log('Navigating to login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'networkidle' });

    console.log('Filling login...');
    await comdipSupplier.fillLogin({
        page,
        supplier,
        fillVisibleLocator: async (loc, val) => loc.fill(val),
        dismissTransientUi: async () => {}
    });

    console.log('Clicking button.btn-parametro...');
    const submit = page.locator('button.btn-parametro, button:has-text("Entrar"):visible').first();
    await submit.click();
    await page.waitForTimeout(5000);

    console.log('After submit URL:', page.url());
    if (page.url().includes('compras') || (await page.locator('text="OFICINA DO"').isVisible().catch(() => false))) {
        const state = await page.context().storageState();
        fs.mkdirSync('scraping/sessions', { recursive: true });
        fs.writeFileSync('scraping/sessions/comdip.json', JSON.stringify(state, null, 2));

        await prisma.supplier.update({
            where: { id: supplier.id },
            data: { sessionData: JSON.stringify(state) }
        });
        console.log('Comdip session saved successfully to disk and DB!');
    } else {
        console.error('Failed to log in to Comdip');
    }

    await browser.close();
}
saveComdipSession().catch(console.error);
