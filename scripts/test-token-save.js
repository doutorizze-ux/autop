const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function testTokenSave() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    await emailField.fill('33.299.637/0001-80');
    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    await passField.fill('Re539597@');

    const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
    if (await consent.isVisible()) await consent.click({ force: true });

    await page.locator('button.btn-parametro, button:has-text("Entrar")').first().click();
    await page.waitForURL(url => url.href.includes('/compras'), { timeout: 20000 });
    await page.waitForTimeout(5000);

    const allLocal = await page.evaluate(() => {
        const res = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            res[k] = localStorage.getItem(k);
        }
        return res;
    });

    console.log('All local keys:', Object.keys(allLocal));
    if (allLocal['ngx-webstorage|jwttoken:comdip']) {
        console.log('JWT token found! Value length:', allLocal['ngx-webstorage|jwttoken:comdip'].length);
    }

    // Now save storageState
    const state = await context.storageState();
    const storedKeys = state.origins[0]?.localStorage?.map(x => x.name) || [];
    console.log('StorageState stored keys count:', storedKeys.length);
    console.log('StorageState has jwttoken:', storedKeys.includes('ngx-webstorage|jwttoken:comdip'));

    fs.writeFileSync('./scraping/sessions/comdip.json', JSON.stringify(state, null, 2));
    console.log('Saved to scraping/sessions/comdip.json');
    await browser.close();
}

testTokenSave().catch(console.error);
