const { chromium } = require('../scraping/node_modules/playwright');

async function testHeaderSearch() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();

    console.log('1. Go to home');
    await page.goto('https://rolemarmaster.com/');
    await page.waitForTimeout(1500);

    console.log('2. Search via header input');
    const input = page.locator('#header-form-search input, input[placeholder*="PESQUISE" i]').first();
    await input.click();
    await input.fill('w712');
    await input.press('Enter');

    console.log('Waiting 3s...');
    await page.waitForTimeout(3000);
    console.log('URL after search:', page.url());

    const count = await page.locator('.product-info, .ui-product-card').count();
    console.log('Cards count:', count);

    await browser.close();
}

testHeaderSearch().catch(console.error);
