const { chromium } = require('../scraping/node_modules/playwright');

async function testAutoLoginBlock() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('Navigating to login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Testing auto-login block...');
    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    
    console.log('Is email field visible:', await emailField.isVisible());
    await emailField.fill('33.299.637/0001-80');
    console.log('Filled email');

    console.log('Is pass field visible:', await passField.isVisible());
    await passField.fill('Re539597@');
    console.log('Filled password');

    const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
    console.log('Is consent visible:', await consent.isVisible());
    if (await consent.isVisible()) {
        await consent.click({ force: true });
        console.log('Clicked consent');
    }

    console.log('Clicking button...');
    const btn = page.locator('button.btn-parametro, button:has-text("Entrar")').first();
    await btn.click();
    console.log('Clicked button! Waiting for URL /compras...');

    await page.waitForURL(url => url.href.includes('/compras'), { timeout: 15000 });
    console.log('Success! URL is now:', page.url());

    await browser.close();
}

testAutoLoginBlock().catch(console.error);
