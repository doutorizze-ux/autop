const { chromium } = require('../scraping/node_modules/playwright');
const path = require('path');

async function test() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();

    console.log('Navigating to compras...');
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    
    console.log('Testing selectors...');
    const selectors = [
        'a:has-text("Sair")',
        'text=OFICINA DO',
        'a:has-text("Meu histórico")',
        'input[type="search"]',
        '.search-input',
    ];

    for (const s of selectors) {
        const start = Date.now();
        const vis = await page.locator(s).first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
        console.log(`Selector "${s}": visible=${vis} (${Date.now() - start}ms)`);
    }

    console.log('Current URL:', page.url());
    await browser.close();
}

test().catch(console.error);
