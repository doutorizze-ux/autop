const { chromium } = require('../scraping/node_modules/playwright');

async function testTurnstileClick() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/');

    const cnpjInput = page.locator('input[type="text"]').first();
    await cnpjInput.fill('33299637000180');

    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill('Re539597@');

    await page.waitForTimeout(2000);

    // Look for turnstile iframe
    const frame = page.frameLocator('iframe[src*="cloudflare"], iframe[src*="turnstile"]');
    const checkbox = frame.locator('input[type="checkbox"], #challenge-stage, .ctp-checkbox-label').first();
    if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Turnstile checkbox found! Clicking...');
        await checkbox.click({ force: true });
        await page.waitForTimeout(3000);
    } else {
        console.log('Checkbox not visible directly, searching frames...');
        for (const f of page.frames()) {
            console.log('Frame url:', f.url());
        }
    }

    const btn = page.locator('button:has-text("Entrar")').first();
    console.log('Button disabled after click attempt?', await btn.isDisabled());

    await page.waitForTimeout(2000);
    await browser.close();
}

testTurnstileClick().catch(console.error);
