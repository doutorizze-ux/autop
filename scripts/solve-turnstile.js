const { chromium } = require('../scraping/node_modules/playwright');

async function testTurnstileClick() {
    console.log('Testing Turnstile click...');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox'
        ]
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');

    // Look for Turnstile iframe
    console.log('Looking for Turnstile iframe...');
    const iframeElement = await page.locator('iframe[src*="challenges.cloudflare.com"]').first();
    if (await iframeElement.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Found Turnstile iframe! Getting frame...');
        const frame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]').first();
        const checkbox = frame.locator('input[type="checkbox"], .ctp-checkbox-label, #challenge-stage').first();
        if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Clicking Turnstile checkbox...');
            await checkbox.click({ force: true });
        }
    }

    // Monitor button
    const btn = page.locator('button:has-text("Entrar")').first();
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        const disabled = await btn.isDisabled();
        const token = await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => '');
        console.log(`Sec ${i+1}: disabled=${disabled}, tokenLen=${token.length}`);
        if (!disabled) {
            console.log('Turnstile SOLVED! Clicking submit...');
            await btn.click();
            await page.waitForURL(url => url.href.includes('/principal'), { timeout: 15000 });
            console.log('Logged into Kaizen! URL:', page.url());
            
            // Save new state
            const state = await context.storageState();
            require('fs').writeFileSync('./scraping/sessions/kaizen-auto-pecas.json', JSON.stringify(state, null, 2));
            console.log('Saved fresh Kaizen session to scraping/sessions/kaizen-auto-pecas.json');
            break;
        }
    }

    await browser.close();
}

testTurnstileClick().catch(console.error);
