const path = require('path');
const fs = require('fs');
const { chromium } = require('../scraping/node_modules/playwright');
const comdip = require('../scraping/suppliers/comdip.js');

async function loginAndSave() {
    const sessionPath = path.resolve(__dirname, '../scraping/sessions/comdip.json');
    console.log('Launching browser to login Comdip...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to Comdip login page...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    await emailField.fill('33.299.637/0001-80');
    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    await passField.fill('Re539597@');

    const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
    if (await consent.isVisible()) await consent.click({ force: true });

    console.log('Clicking login...');
    await page.locator('button.btn-parametro, button:has-text("Entrar")').first().click();
    
    // Wait for login redirect
    await page.waitForURL(url => url.href.includes('/compras'), { timeout: 20000 });
    console.log('Login successful! URL:', page.url());
    await page.waitForTimeout(3000);

    // Save session
    const state = await context.storageState();
    fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), 'utf-8');
    console.log('Saved session state to:', sessionPath);

    // Now test search using comdip supplier module
    console.log('Testing search with comdip module...');
    await comdip.performSearch({ page, query: 'w712', supplier: { name: 'Comdip' } });
    const items = await comdip.extractItems({ page, supplier: { name: 'Comdip' } });
    console.log('Extracted items count:', items.length);
    if (items.length > 0) {
        console.log('Sample item:', items[0]);
    }

    await browser.close();
}

loginAndSave().catch(console.error);
