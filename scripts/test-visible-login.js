const { chromium } = require('../scraping/node_modules/playwright');

async function testVisibleLogin() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('response', async res => {
        const u = res.url();
        if (u.includes('login') || u.includes('auth') || u.includes('authcode')) {
            console.log('RESPONSE:', res.status(), u);
            try {
                const text = await res.text();
                console.log('RESPONSE BODY:', text.slice(0, 500));
            } catch (_) {}
        }
    });

    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');

    const btn = page.locator('button:has-text("Entrar")').first();
    console.log('Waiting for Turnstile auto-solve...');
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        if (!(await btn.isDisabled())) {
            console.log('Turnstile solved! Clicking submit...');
            await btn.click();
            break;
        }
    }

    // Wait for response and localStorage
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        const token = await page.evaluate(() => localStorage.getItem('token'));
        if (token) {
            console.log('SUCCESS! Token obtained:', token.slice(0, 40) + '...');
            const state = await context.storageState();
            require('fs').writeFileSync('./scraping/sessions/kaizen-auto-pecas.json', JSON.stringify(state, null, 2));
            console.log('Session saved to kaizen-auto-pecas.json');
            break;
        }
    }

    await browser.close();
}

testVisibleLogin().catch(console.error);
