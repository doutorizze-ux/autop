const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function testAutoNorte() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/auto-norte-kki.json', 'utf8'));
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext({
        storageState: {
            cookies: session.cookies,
            origins: session.origins
        }
    });
    const page = await context.newPage();
    console.log('Navigating to Auto Norte compras...');
    await page.goto('https://kki.autonorte.com.br/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const inputs = await page.evaluate(() => 
        Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type,
            placeholder: i.placeholder,
            id: i.id,
            className: i.className
        }))
    );
    console.log('Inputs found:', inputs);

    const buttons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
    );
    console.log('Buttons found:', buttons);

    await browser.close();
}

testAutoNorte().catch(console.error);
