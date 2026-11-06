const { chromium } = require('../scraping/node_modules/playwright');
const path = require('path');

async function findVisibleOnCompras() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: sessionPath });
    const page = await context.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const visibleElements = await page.evaluate(() => {
        const all = document.querySelectorAll('header, nav, .header, .user, [class*="login"], [class*="menu"], [class*="perfil"], button, a, span');
        const visible = [];
        for (const el of all) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const text = (el.innerText || '').trim();
                if (text && text.length < 60) {
                    visible.push({ tag: el.tagName, text, class: el.className });
                }
            }
        }
        return visible.slice(0, 40);
    });

    console.log('Visible elements on compras:\n', JSON.stringify(visibleElements, null, 2));
    await browser.close();
}

findVisibleOnCompras().catch(console.error);
