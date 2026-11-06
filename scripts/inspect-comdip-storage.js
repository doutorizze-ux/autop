const { chromium } = require('../scraping/node_modules/playwright');

async function inspectStorage() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
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
    await page.waitForTimeout(3000);

    const storage = await page.evaluate(() => {
        const session = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            session[key] = sessionStorage.getItem(key);
        }
        const local = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('token') || key.includes('user') || key.includes('auth') || key.includes('login') || key.includes('ngx-webstorage')) {
                local[key] = localStorage.getItem(key);
            }
        }
        return { session, localKeys: Object.keys(local), local };
    });

    console.log('Session storage keys:', Object.keys(storage.session));
    console.log('Local storage relevant keys:', storage.localKeys);
    console.log('Storage snapshot:', JSON.stringify(storage, null, 2).slice(0, 2000));

    await browser.close();
}

inspectStorage().catch(console.error);
