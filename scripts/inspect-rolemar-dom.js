const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://rolemarmaster.com/login');
    await page.waitForTimeout(1500);

    const cb = page.locator('button:has-text("Aceitar Cookies")').first();
    if (await cb.isVisible()) await cb.click();

    await page.locator('input#usuario, input[name="usuario"]').first().fill('33299637000180');
    await page.locator('input#senha, input[name="senha"]').first().fill('Re539597@');
    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(4000);

    await page.goto('https://rolemarmaster.com/produtos?busca=w712');
    await page.waitForTimeout(4000);

    const elements = await page.evaluate(() => {
        const allCards = Array.from(document.querySelectorAll('*')).filter(el => {
            const cl = String(el.className || '');
            return cl.includes('product') || cl.includes('card') || cl.includes('item');
        });
        return allCards.slice(0, 20).map(el => ({ tag: el.tagName, class: el.className, text: el.innerText.slice(0, 100) }));
    });
    console.log('Cards found:', JSON.stringify(elements, null, 2));

    await browser.close();
}

test().catch(console.error);
