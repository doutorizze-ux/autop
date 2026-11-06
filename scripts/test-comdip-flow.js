const { chromium } = require('../scraping/node_modules/playwright');
const comdip = require('../scraping/suppliers/comdip.js');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Accessing Comdip login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await comdip.fillLogin({
        page,
        supplier: { loginCredential: '33.299.637/0001-80', password: 'Re539597@' },
        dismissTransientUi: async () => {}
    });

    const submitBtn = page.locator('button.btn-parametro, button:has-text("Entrar")').first();
    await submitBtn.click();
    console.log('Clicked login button, waiting...');
    await page.waitForTimeout(6000);
    console.log('URL after login:', page.url());

    // Search for w712
    const searchUrl = comdip.buildSearchUrl('w712');
    console.log('Navigating to search URL:', searchUrl);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    console.log('URL after search:', page.url());

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body snippet:\n', bodyText.slice(0, 800));

    const items = await comdip.extractItems({ page, supplier: { name: 'Comdip' }, query: 'w712' });
    console.log('Items extracted:', items.length);
    if (items.length > 0) {
        console.log('First item:', items[0]);
    }

    await browser.close();
}

run().catch(console.error);
