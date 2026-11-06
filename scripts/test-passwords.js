const { chromium } = require('../scraping/node_modules/playwright');

const passwords = [
    'Ren@n0058@',
    'rE539597@',
    'admin158158',
    '33299637000180',
    'Renan0058@',
    'Renan0058',
    're539597',
    'Re539597',
    '125435',
    '71401'
];

async function testPasswords() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    let lastStatus = 0;
    let lastBody = '';

    page.on('response', async res => {
        if (res.url().includes('services.kaizenautopecas.com.br/login')) {
            lastStatus = res.status();
            try {
                lastBody = await res.text();
            } catch (_) {}
            console.log(`LOGIN RESULT: ${lastStatus} - ${lastBody}`);
        }
    });

    for (const pass of passwords) {
        console.log(`Testing password: ${pass}...`);
        await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const userInput = page.locator('input[placeholder*="cnpj" i]').first();
        const passInput = page.locator('input[placeholder*="senha" i]').first();
        await userInput.fill('33299637000180');
        await passInput.fill(pass);

        const btn = page.locator('button:has-text("Entrar")').first();
        for (let i = 0; i < 8; i++) {
            await page.waitForTimeout(800);
            if (!(await btn.isDisabled())) {
                await btn.click();
                break;
            }
        }

        await page.waitForTimeout(3000);
        if (lastStatus === 200) {
            console.log(`FOUND WORKING PASSWORD FOR KAIZEN: ${pass}`);
            const state = await context.storageState();
            require('fs').writeFileSync('./scraping/sessions/kaizen-auto-pecas.json', JSON.stringify(state, null, 2));
            console.log('Saved session to kaizen-auto-pecas.json');
            break;
        }
    }

    await browser.close();
}

testPasswords().catch(console.error);
