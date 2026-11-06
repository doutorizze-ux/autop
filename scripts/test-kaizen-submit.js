const { chromium } = require('../scraping/node_modules/playwright');

async function testKaizenSubmit() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false // Let's check with visible or headless
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    const btn = page.locator('button:has-text("Entrar")').first();

    // Fill CNPJ without dots
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');
    console.log('Filled credentials');

    // Wait 4 seconds to see if Turnstile solves itself
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(1000);
        const disabled = await btn.isDisabled();
        const turnstileToken = await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => '');
        console.log(`Sec ${i+1}: Button disabled = ${disabled}, Turnstile token len = ${turnstileToken.length}`);
        if (!disabled) {
            console.log('Button is enabled! Clicking...');
            await btn.click();
            await page.waitForTimeout(5000);
            console.log('URL after click:', page.url());
            const tokenInStorage = await page.evaluate(() => localStorage.getItem('token'));
            console.log('JWT Token in localStorage:', Boolean(tokenInStorage));
            break;
        }
    }

    await browser.close();
}

testKaizenSubmit().catch(console.error);
