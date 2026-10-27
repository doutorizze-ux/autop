const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function test() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/sky-pecas.json', 'utf8'));
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext({ storageState: session });
    const page = await context.newPage();
    await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 1. Test W712 in #inpCodigo
    console.log('Testing W712 in #inpCodigo...');
    await page.locator('#inpCodigo').fill('W712');
    await page.locator('#btnBuscar').click();
    await page.waitForTimeout(4000);
    let cards = await page.locator('.bx_produto').count();
    console.log('Cards found for W712 in #inpCodigo:', cards);

    // Close sweetalert if any
    const swal = page.locator('button.swal2-confirm, button:has-text("OK")').first();
    if (await swal.isVisible().catch(() => false)) await swal.click().catch(() => {});
    await page.waitForTimeout(1000);

    // 2. Test PSL560 in #inpPeca
    console.log('Testing PSL560 in #inpPeca...');
    await page.locator('#inpCodigo').fill('');
    await page.locator('#inpPeca').fill('PSL560');
    await page.locator('#btnBuscar').click();
    await page.waitForTimeout(4000);
    cards = await page.locator('.bx_produto').count();
    console.log('Cards found for PSL560 in #inpPeca:', cards);

    // Close sweetalert if any
    if (await swal.isVisible().catch(() => false)) await swal.click().catch(() => {});
    await page.waitForTimeout(1000);

    // 3. Test W712 in #inpPeca
    console.log('Testing W712 in #inpPeca...');
    await page.locator('#inpCodigo').fill('');
    await page.locator('#inpPeca').fill('W712');
    await page.locator('#btnBuscar').click();
    await page.waitForTimeout(4000);
    cards = await page.locator('.bx_produto').count();
    console.log('Cards found for W712 in #inpPeca:', cards);

    await browser.close();
}

test().catch(console.error);
