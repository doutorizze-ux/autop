const { chromium } = require('../scraping/node_modules/playwright');
const comdip = require('../scraping/suppliers/comdip.js');

async function testFull() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    
    console.log('Calling fillLogin...');
    await comdip.fillLogin({ page, supplier: { loginCredential: '33.299.637/0001-80', password: 'Re539597@' } });

    console.log('Clicking submit button...');
    await page.locator('button.btn-parametro, button:has-text("Entrar")').first().click();
    
    console.log('Calling afterLogin...');
    await page.waitForURL(url => url.href.includes('/compras'), { timeout: 20000 });
    console.log('Logged in successfully! URL:', page.url());
    await page.waitForTimeout(3000);

    console.log('Calling performSearch...');
    await comdip.performSearch({ page, query: 'w712', supplier: { name: 'Comdip' } });

    console.log('Calling extractItems...');
    const items = await comdip.extractItems({ page, supplier: { name: 'Comdip' } });
    console.log('Items extracted count:', items.length);
    console.log('First 2 items:', items.slice(0, 2));

    await browser.close();
}

testFull().catch(console.error);
