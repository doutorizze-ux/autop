const { chromium } = require('../scraping/node_modules/playwright');
const rolemarModule = require('../scraping/suppliers/rolemar');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://rolemarmaster.com/login');
    await page.waitForTimeout(1500);

    const cb = page.locator('button:has-text("Aceitar Cookies")').first();
    if (await cb.isVisible()) await cb.click();

    await page.locator('input#usuario, input[name="usuario"]').first().fill('33299637000180');
    await page.locator('input#senha, input[name="senha"]').first().fill('Re539597@');
    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(4000);

    await page.goto('https://rolemarmaster.com/produtos?busca=w712');
    await page.waitForTimeout(4000);

    const items = await rolemarModule.extractItems({ page, supplier: {}, query: 'w712' });
    console.log('EXTRACTED ITEMS COUNT:', items.length);
    if (items.length > 0) {
        console.log('First item:', JSON.stringify(items[0], null, 2));
    }

    await browser.close();
}

test().catch(console.error);
