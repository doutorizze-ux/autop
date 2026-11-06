const path = require('path');
const fs = require('fs');
const { chromium } = require('../scraping/node_modules/playwright');

async function saveComdipRealSession() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Accessing login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    await emailField.fill('33.299.637/0001-80');
    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    await passField.fill('Re539597@');

    const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
    if (await consent.isVisible()) await consent.click({ force: true });

    console.log('Submitting login...');
    await page.locator('button.btn-parametro, button:has-text("Entrar")').first().click();

    // Wait for the token in localStorage
    console.log('Waiting for jwttoken in localStorage...');
    await page.waitForFunction(() => {
        const token = localStorage.getItem('ngx-webstorage|jwttoken:comdip');
        return token && token.length > 20;
    }, { timeout: 25000 });

    console.log('Token detected in localStorage!');
    await page.waitForTimeout(2000);

    const state = await context.storageState();
    fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Session saved successfully to:', sessionPath);

    await browser.close();

    // Now test restoring this session in a new browser!
    console.log('Verifying session restore in brand new browser context...');
    const b2 = await chromium.launch({ headless: true });
    const c2 = await b2.newContext({ storageState: sessionPath });
    const p2 = await c2.newPage();
    await p2.goto('https://portalcomdip.com.br/comdip/compras', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(4000);
    console.log('P2 URL after goto compras:', p2.url());
    const hasSair = await p2.locator('a:has-text("Sair")').isVisible();
    console.log('P2 has Sair (authenticated):', hasSair);
    await b2.close();
}

saveComdipRealSession().catch(console.error);
