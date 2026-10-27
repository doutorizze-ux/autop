const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function inspectCard() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/dpk.json', 'utf8'));
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
    if (session.localStorage) {
        await page.addInitScript((ls) => {
            for (const [k, v] of Object.entries(ls)) {
                try { localStorage.setItem(k, v); } catch (_) {}
            }
        }, session.localStorage);
    }
    await page.goto('https://www.dpk.com.br/#/busca-produto?termo=vela', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const firstCardHtml = await page.evaluate(() => {
        const card = document.querySelector('.column-view-card, div.cardsAlinhamento > mat-card, mat-card.produto-card');
        return card ? card.outerHTML : 'none';
    });
    console.log('First card HTML sample:');
    console.log(firstCardHtml.substring(0, 1500));
    await browser.close();
}

inspectCard().catch(console.error);
