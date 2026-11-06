const { chromium } = require('../scraping/node_modules/playwright');

async function inspect() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('Navigating to Kaizen...');
    await page.goto('https://portal.kaizenautopecas.com.br/');
    await page.waitForTimeout(2000);

    const cnpjInput = page.locator('input[placeholder*="cnpj" i], input[type="text"]').first();
    await cnpjInput.click();
    await cnpjInput.pressSequentially('33299637000180', { delay: 50 });
    await cnpjInput.dispatchEvent('input');
    await cnpjInput.dispatchEvent('change');

    const passInput = page.locator('input[type="password"]').first();
    await passInput.click();
    await passInput.pressSequentially('Re539597@', { delay: 50 });
    await passInput.dispatchEvent('input');
    await passInput.dispatchEvent('change');

    await page.waitForTimeout(2000);

    const btn = page.locator('button:has-text("Entrar")').first();
    const disabled = await btn.isDisabled();
    console.log('Button disabled?', disabled);
    const btnHtml = await btn.evaluate(el => el.outerHTML);
    console.log('Button HTML:', btnHtml);

    if (!disabled) {
        console.log('Clicking Entrar...');
        await btn.click();
        await page.waitForTimeout(4000);
        console.log('Final URL:', page.url());
        console.log('Snippet:', (await page.evaluate(() => document.body.innerText)).slice(0, 300));
    }

    const iframes = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(i => i.src));
    console.log('Iframes:', iframes);
    await browser.close();
}

inspect().catch(console.error);
