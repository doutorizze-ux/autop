const { chromium } = require('../scraping/node_modules/playwright');
const rolemar = require('../scraping/suppliers/rolemar.js');

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Login
    await page.goto('https://rolemarmaster.com/login');
    await rolemar.fillLogin({ page, supplier: { loginCredential: '33299637000180', password: 'Re539597@' } });
    await page.locator('button:has-text("Entrar")').first().click();
    await page.waitForTimeout(4000);
    
    console.log('Login complete, URL:', page.url());
    
    // Test performSearch
    console.log('Starting performSearch...');
    await rolemar.performSearch({ page, query: 'w712', supplier: { name: 'Rolemar Master' } });
    
    const items = await rolemar.extractItems({ page, supplier: { name: 'Rolemar Master' }, query: 'w712' });
    console.log('Rolemar extractItems result count:', items.length);
    if (items.length > 0) {
        console.log('First item:', items[0]);
    }
    await browser.close();
}

run().catch(console.error);
