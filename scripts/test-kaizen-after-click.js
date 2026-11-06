const { chromium } = require('../scraping/node_modules/playwright');

async function testKaizenLogin() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('request', req => {
        const u = req.url();
        if (!u.includes('.js') && !u.includes('.css') && !u.includes('challenges.cloudflare.com')) {
            console.log('REQ:', req.method(), u, req.postData() ? req.postData().slice(0, 150) : '');
        }
    });

    page.on('response', async res => {
        const u = res.url();
        if (!u.includes('.js') && !u.includes('.css') && !u.includes('challenges.cloudflare.com')) {
            try {
                const text = await res.text();
                console.log('RES:', res.status(), u, text.slice(0, 200));
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
    console.log('Waiting for Turnstile...');
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);
        if (!(await btn.isDisabled())) {
            console.log('Turnstile solved! Clicking submit...');
            await btn.click();
            break;
        }
    }

    await page.waitForTimeout(6000);
    const toast = await page.locator('.ant-message, .toast, .swal2-container, div[role="alert"]').allInnerTexts().catch(() => []);
    console.log('Any alert/toast on screen:', toast);

    await browser.close();
}

testKaizenLogin().catch(console.error);
