const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function test() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/comdip.json', 'utf8'));
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext({ storageState: session });
    const page = await context.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'networkidle' });

    console.log('Filling search input...');
    const input = page.locator('input[name="src"]:visible, input[placeholder*="Busque por Nome"]:visible').first();
    await input.fill('W712');
    await input.press('Enter');
    await page.waitForTimeout(6000);

    console.log('After search URL:', page.url());
    const cards = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[class*="produto"], [class*="item"], [class*="card"], tr'));
        return els.map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(t => /R\$\s*[0-9]/.test(t)).slice(0, 5);
    });
    console.log('Cards found:', cards.length);
    console.log('Cards:', cards);

    await browser.close();
}
test().catch(console.error);
