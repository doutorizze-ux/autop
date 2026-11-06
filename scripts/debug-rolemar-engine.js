const { chromium } = require('../scraping/node_modules/playwright');
const rolemar = require('../scraping/suppliers/rolemar');

async function debugStepByStep() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();

    console.log('--- Step 1: goto searchUrl ---');
    const searchUrl = 'https://rolemarmaster.com/produtos?busca=w712';
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);

    console.log('--- Step 2: performSearch ---');
    await rolemar.performSearch({ page, query: 'w712', supplier: {} });
    console.log('URL after performSearch:', page.url());

    console.log('--- Step 3: waitForPageSettle emulation ---');
    const selectors = ['.product-info', '.ant-spin-container', '.ant-empty'];
    let found = false;
    for (let i = 0; i < 20; i++) {
        for (const s of selectors) {
            if (await page.locator(s).first().isVisible().catch(() => false)) {
                console.log(`Selector visible at attempt ${i}: ${s}`);
                found = true;
                break;
            }
        }
        if (found) break;
        await page.waitForTimeout(500);
    }

    console.log('--- Step 4: extractItems ---');
    const items = await rolemar.extractItems({ page, supplier: {}, query: 'w712' });
    console.log('Items extracted:', items.length);

    console.log('--- Step 5: Check why finalItems failed ---');
    const cleanItems = items.map(it => {
        const match = String(it.preco).match(/([0-9.,]+)/);
        const clean = match ? match[1].replace(/\./g, '').replace(',', '.') : 0;
        const price = parseFloat(clean) || 0;
        return {
            product: it.nome,
            price,
            available: it.estoque > 0,
        };
    });
    console.log('Clean items:', cleanItems.slice(0, 3));

    await browser.close();
}

debugStepByStep().catch(console.error);
