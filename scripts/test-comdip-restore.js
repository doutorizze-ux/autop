const path = require('path');
const { chromium } = require('../scraping/node_modules/playwright');

async function testRestore() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();

    console.log('Navigating to Comdip compras directly with saved session...');
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    console.log('URL after loading compras:', page.url());

    const hasSair = await page.locator('a:has-text("Sair")').isVisible();
    console.log('Has Sair button:', hasSair);

    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('Body snippet:\n', bodyText);

    await browser.close();
}

testRestore().catch(console.error);
