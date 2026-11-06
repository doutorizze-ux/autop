const { chromium } = require('../scraping/node_modules/playwright');

async function testCpfLogin() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const page = await browser.newPage();

    page.on('response', async res => {
        const u = res.url();
        if (u.includes('login')) {
            console.log('LOGIN RESPONSE:', res.status());
            try {
                console.log('BODY:', (await res.text()).slice(0, 300));
            } catch (_) {}
        }
    });

    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('69461929153');
    await passInput.fill('Re539597@');

    const btn = page.locator('button:has-text("Entrar")').first();
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        if (!(await btn.isDisabled())) {
            console.log('Turnstile solved! Clicking submit with CPF...');
            await btn.click();
            break;
        }
    }

    await page.waitForTimeout(5000);
    await browser.close();
}

testCpfLogin().catch(console.error);
