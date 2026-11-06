const { chromium } = require('../scraping/node_modules/playwright');

async function testComdipLogin() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
    });
    const page = await browser.newPage();
    console.log('Navigating to Comdip...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login');
    await page.waitForTimeout(2000);

    const emailField = page.locator('#mat-input-0');
    await emailField.click();
    await emailField.fill('33.299.637/0001-80');

    const passField = page.locator('#mat-input-1');
    await passField.click();
    await passField.fill('Re539597@');

    const checkbox = page.locator('input[name="cbAceitarTermos"]');
    await checkbox.check({ force: true }).catch(() => {});

    await page.waitForTimeout(500);

    const btn = page.locator('button:has-text("Entrar")').first();
    console.log('Clicking Entrar...');
    await btn.click();

    console.log('Waiting 5s...');
    await page.waitForTimeout(5000);

    console.log('URL after login:', page.url());
    console.log('Body snippet:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));

    // Save session storage state
    const storage = await page.context().storageState();
    console.log('Cookies count:', storage.cookies.length);

    await browser.close();
}

testComdipLogin().catch(console.error);
