const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-web-security'
        ]
    });
    const context = await browser.newContext();
    await context.addInitScript(() => {
        delete Object.getPrototypeOf(navigator).webdriver;
        window.navigator.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    console.log('Navigating with stealth...');
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const userInput = page.locator('input[placeholder*="cnpj" i], input[type="text"]').first();
    await userInput.fill('33299637000180');
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill('Re539597@');

    console.log('Waiting 6s for Turnstile to auto-solve...');
    await page.waitForTimeout(6000);

    const btn = page.locator('button:has-text("Entrar")').first();
    const disabled = await btn.isDisabled();
    console.log('Button disabled with stealth?', disabled);

    if (!disabled) {
        await btn.click();
        console.log('Clicked Entrar!');
        await page.waitForTimeout(5000);
        console.log('URL after submit:', page.url());
    }

    await browser.close();
}
test().catch(console.error);
