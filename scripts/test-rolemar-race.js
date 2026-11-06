const { chromium } = require('../scraping/node_modules/playwright');

async function testRace() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();

    // When engine runs:
    // 1. page.goto(searchUrl)
    const searchUrl = 'https://rolemarmaster.com/produtos?busca=w712';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

    // 2. performSearch called:
    // In performSearch: await page.goto(searchUrl)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);

    const winner = await Promise.race([
        page.locator('.product-info').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => 'PRODUCT_INFO').catch(e => 'ERR_PROD: ' + e.message),
        page.locator('.ant-empty, :has-text("Nenhum produto")').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => 'EMPTY').catch(e => 'ERR_EMPTY: ' + e.message),
    ]);
    console.log('Winner:', winner);

    await browser.close();
}

testRace().catch(console.error);
