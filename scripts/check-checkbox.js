const { chromium } = require('../scraping/node_modules/playwright');

async function check() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const cb = await page.evaluate(() => {
        const els = document.querySelectorAll('input[type="checkbox"], mat-checkbox, label');
        return Array.from(els).map(e => ({ tag: e.tagName, text: e.innerText, name: e.name || '', class: e.className }));
    });
    console.log('Checkboxes & labels:\n', JSON.stringify(cb, null, 2));
    await browser.close();
}

check().catch(console.error);
