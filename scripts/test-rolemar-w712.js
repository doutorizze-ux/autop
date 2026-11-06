const { chromium } = require('../scraping/node_modules/playwright');

async function testRolemar() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    console.log('Accessing Rolemar login...');
    await page.goto('https://rolemarmaster.com/login');
    await page.waitForTimeout(2000);

    const cookieBtn = page.locator('button:has-text("Aceitar Cookies")').first();
    if (await cookieBtn.isVisible()) await cookieBtn.click();

    const u = page.locator('input#usuario, input[name="usuario"]').first();
    const p = page.locator('input#senha, input[name="senha"]').first();
    await u.fill('33299637000180');
    await p.fill('Re539597@');

    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(4000);
    console.log('URL after login:', page.url());

    await page.goto('https://rolemarmaster.com/produtos?busca=w712');
    await page.waitForTimeout(4000);
    console.log('Search page URL:', page.url());

    const items = await page.evaluate(() => document.querySelectorAll('.product-info').length);
    console.log('Items found:', items);

    const body = await page.evaluate(() => document.body.innerText);
    console.log('Body snippet:\n', body.slice(0, 1000));

    await browser.close();
}

testRolemar().catch(console.error);
