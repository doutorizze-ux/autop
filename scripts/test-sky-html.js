const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function test() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/sky-pecas.json', 'utf8'));
    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const context = await browser.newContext({ storageState: session });
    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    console.log('Typing W712...');
    await page.locator('#inpCodigo').fill('W712');
    await page.locator('#btnBuscar').click({ force: true });
    await page.waitForTimeout(4000);

    const cardsCount = await page.locator('.bx_produto').count();
    console.log('.bx_produto count:', cardsCount);

    const cardHtml = await page.locator('.bx_produto').first().innerHTML();
    console.log('First card innerHTML:', cardHtml);

    await browser.close();
}
test().catch(console.error);
