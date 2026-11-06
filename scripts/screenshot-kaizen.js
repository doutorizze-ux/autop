const { chromium } = require('../scraping/node_modules/playwright');

(async () => {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');

    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'kaizen-turnstile-debug.png', fullPage: true });
    console.log('Screenshot taken!');

    // Check all frames
    for (const f of page.frames()) {
        console.log('Frame:', f.url());
    }

    await browser.close();
})().catch(console.error);
