const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();
    await page.goto('https://rolemarmaster.com/produtos?busca=w712');
    await page.waitForTimeout(4000);

    const res = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.ui-product-card'));
        return cards.map(c => {
            const codeEl = c.querySelector('.product-code-text') || c.querySelector('.product-code');
            const titleEl = c.querySelector('.product-title');
            const priceEl = c.querySelector('.final-price p') || c.querySelector('.price p') || c.querySelector('[class*="price"]');
            return {
                code: codeEl ? codeEl.innerText.trim() : null,
                title: titleEl ? titleEl.innerText.trim() : null,
                price: priceEl ? priceEl.innerText.trim() : null,
            };
        });
    });

    console.log(JSON.stringify(res, null, 2));
    await browser.close();
}

test().catch(console.error);
