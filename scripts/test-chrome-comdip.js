const { chromium } = require('../scraping/node_modules/playwright');
const path = require('path');

async function testChromeComdip() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('response', res => {
        if (res.status() >= 400) {
            console.log('HTTP ERROR:', res.status(), res.url());
        }
    });

    console.log('Opening compras...');
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(1000);
        console.log(`Sec ${i+1} URL:`, page.url());
    }

    await browser.close();
}

testChromeComdip().catch(console.error);
