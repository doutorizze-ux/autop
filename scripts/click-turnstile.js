const { chromium } = require('../scraping/node_modules/playwright');

(async () => {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');

    await page.waitForTimeout(2000);

    const cfFrame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
    if (cfFrame) {
        console.log('Found cfFrame!');
        const elements = await cfFrame.evaluate(() => {
            return Array.from(document.querySelectorAll('*')).map(el => ({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                type: el.type,
                text: el.innerText
            })).filter(x => x.text || x.tag === 'INPUT');
        });
        console.log('Frame elements:', JSON.stringify(elements, null, 2));

        const checkbox = cfFrame.locator('input[type="checkbox"], #challenge-stage, .ctp-checkbox-label, body').first();
        console.log('Clicking inside frame...');
        await checkbox.click({ force: true }).catch(console.error);

        await page.waitForTimeout(3000);
        console.log('Button Entrar disabled after frame click?', await page.locator('button:has-text("Entrar")').isDisabled());
        const token = await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => '');
        console.log('Turnstile response token length:', token.length);
    } else {
        console.log('cfFrame not found');
    }

    await browser.close();
})().catch(console.error);
