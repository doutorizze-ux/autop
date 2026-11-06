const { chromium } = require('../scraping/node_modules/playwright');

async function testComdip() {
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
    });
    const page = await browser.newPage();
    console.log('Navigating to Comdip catalogo/login...');
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login');
    await page.waitForTimeout(3000);

    console.log('Final URL:', page.url());
    console.log('Page Title:', await page.title());
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, placeholder: i.placeholder, name: i.name, id: i.id })));
    console.log('Inputs found:', inputs);

    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()));
    console.log('Buttons found:', buttons);

    await browser.close();
}

testComdip().catch(console.error);
