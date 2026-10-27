const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const cnpjInput = page.locator('input[placeholder*="CNPJ" i]').first();
    await cnpjInput.click();
    await cnpjInput.type('33299637000180', { delay: 50 });

    const passInput = page.locator('input[type="password"]').first();
    await passInput.click();
    await passInput.type('Re539597@', { delay: 50 });

    await page.waitForTimeout(2000);
    console.log('CNPJ input value:', await cnpjInput.inputValue());
    console.log('Pass input value:', await passInput.inputValue());

    const btn = page.locator('button[type="submit"]').first();
    console.log('Button disabled?', await btn.isDisabled());

    const turnstileResponse = await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => 'none');
    console.log('Turnstile response value length:', turnstileResponse.length);

    await browser.close();
}
test().catch(console.error);
