const { chromium } = require('../scraping/node_modules/playwright');
const path = require('path');

async function run() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const checks = {
        'input[type="search"]': await page.locator('input[type="search"]').count(),
        '.search-input': await page.locator('.search-input').count(),
        'isthmus-cabecalho-padrao': await page.locator('isthmus-cabecalho-padrao').count(),
        'text=OFICINA DO': await page.locator('text=OFICINA DO').count(),
        'a:has-text("Sair")': await page.locator('a:has-text("Sair")').count(),
        'a[aria-label*="Sair"]': await page.locator('a[aria-label*="Sair"]').count(),
    };
    console.log('Selectors present:', checks);
    await browser.close();
}

run().catch(console.error);
