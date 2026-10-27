const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');
const sky = require('../scraping/suppliers/sky');

async function test() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/sky-pecas.json', 'utf8'));
    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const context = await browser.newContext({ storageState: session });
    const page = await context.newPage();

    await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('1. Calling performSearch...');
    await sky.performSearch({ page, query: 'W712', dismissTransientUi: async () => {} });

    console.log('2. Checking cards after performSearch...');
    const cardsCount = await page.locator('.bx_produto').count();
    console.log('Cards immediately after performSearch:', cardsCount);

    console.log('3. Calling extractItems...');
    const items = await sky.extractItems({ page, supplier: { name: 'Sky Peças' }, query: 'W712', dismissTransientUi: async () => {} });
    console.log('Items returned by extractItems:', items.length);

    await browser.close();
}
test().catch(console.error);
