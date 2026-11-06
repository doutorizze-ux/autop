const { chromium } = require('../scraping/node_modules/playwright');
const path = require('path');

async function testSearchNav() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();

    console.log('1. Loading authenticated page compras...');
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('Current URL:', page.url());

    console.log('2. Navigating to search URL...');
    await page.goto('https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/w712/1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('URL after goto search:', page.url());

    // Check if cards are present
    const cards = await page.locator('isthmus-produto-b2b-card, .produto-card').count();
    console.log('Cards count:', cards);

    await browser.close();
}

testSearchNav().catch(console.error);
