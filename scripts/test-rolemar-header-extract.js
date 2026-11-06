const { chromium } = require('../scraping/node_modules/playwright');
const rolemar = require('../scraping/suppliers/rolemar');

async function testHeaderSearch() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();

    await page.goto('https://rolemarmaster.com/');
    await page.waitForTimeout(1500);

    const input = page.locator('#header-form-search input, input[placeholder*="PESQUISE" i]').first();
    await input.click();
    await input.fill('w712');
    await input.press('Enter');

    await page.waitForTimeout(3000);

    const items = await rolemar.extractItems({ page, query: 'w712', supplier: { name: 'Rolemar Master' } });
    console.log('Extracted count:', items.length);
    if (items.length > 0) {
        console.log('First 2:', items.slice(0, 2));
    }

    await browser.close();
}

testHeaderSearch().catch(console.error);
