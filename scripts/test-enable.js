const { chromium } = require('../scraping/node_modules/playwright');

async function testEnable() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const btn = page.locator('button.btn-parametro, button:has-text("Entrar")').first();
    console.log('Initial button disabled:', await btn.isDisabled());

    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    await emailField.fill('33.299.637/0001-80');
    console.log('After email filled, button disabled:', await btn.isDisabled());

    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    await passField.fill('Re539597@');
    console.log('After password filled, button disabled:', await btn.isDisabled());

    const cb = page.locator('input[name="cbAceitarTermos"]');
    await cb.check({ force: true });
    console.log('After cb checked, button disabled:', await btn.isDisabled());

    // If still disabled, check why
    if (await btn.isDisabled()) {
        const formState = await page.evaluate(() => {
            const form = document.querySelector('form');
            return {
                formValid: form ? form.checkValidity() : null,
                cbChecked: document.querySelector('input[name="cbAceitarTermos"]')?.checked,
                emailVal: document.querySelector('#mat-input-0')?.value,
                passVal: document.querySelector('#mat-input-1')?.value,
            };
        });
        console.log('Form state:', formState);
    }

    await browser.close();
}

testEnable().catch(console.error);
