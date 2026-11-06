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

    const info = await page.evaluate(() => {
        const btn = document.querySelector('button');
        const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
            id: i.id, name: i.name, placeholder: i.placeholder, value: i.value, disabled: i.disabled
        }));
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src);
        return {
            button: btn ? { text: btn.innerText, disabled: btn.disabled, className: btn.className } : null,
            inputs,
            iframes
        };
    });
    console.log(JSON.stringify(info, null, 2));

    const userInput = page.locator('input[placeholder*="cnpj" i]').first();
    const passInput = page.locator('input[placeholder*="senha" i]').first();
    await userInput.fill('33299637000180');
    await passInput.fill('Re539597@');

    await page.waitForTimeout(3000);
    const afterFill = await page.evaluate(() => {
        const btn = document.querySelector('button');
        const cfInputs = Array.from(document.querySelectorAll('input[name*="cf"]')).map(i => ({ name: i.name, value: i.value }));
        const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText, disabled: b.disabled }));
        return {
            btnDisabled: btn ? btn.disabled : null,
            allButtons,
            cfInputs
        };
    });
    console.log('After fill:', JSON.stringify(afterFill, null, 2));

    await browser.close();
})().catch(console.error);
