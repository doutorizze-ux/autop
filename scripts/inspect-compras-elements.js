const { chromium } = require('../scraping/node_modules/playwright');

async function inspectComprasElements() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ storageState: './scraping/sessions/vespor-pro.json' });
    const page = await context.newPage();

    await page.goto('https://vesporpro.com.br/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const elements = await page.evaluate(() => {
        return {
            hasNavbar: !!document.querySelector('.navbar'),
            navLinks: Array.from(document.querySelectorAll('a, button, span')).slice(0, 15).map(e => ({ tag: e.tagName, text: e.innerText?.slice(0, 30), class: e.className })),
            inputs: Array.from(document.querySelectorAll('input')).map(i => ({ placeholder: i.placeholder, class: i.className }))
        };
    });

    console.log('Compras elements:\n', JSON.stringify(elements, null, 2));
    await browser.close();
}

inspectComprasElements().catch(console.error);
