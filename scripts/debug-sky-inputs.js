const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function testSkyInputs() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/sky-pecas.json', 'utf8'));
    const browser = await chromium.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext({
        storageState: {
            cookies: session.cookies,
            origins: session.origins
        }
    });
    const page = await context.newPage();
    console.log('Navigating to Sky Peças produtos...');
    await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const inputs = await page.evaluate(() => 
        Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type,
            placeholder: i.placeholder,
            id: i.id,
            name: i.name,
            className: i.className
        }))
    );
    console.log('Inputs on Sky Peças:', inputs);

    // Let's test search in both inputs
    // #inpCodigo and #inpPeca
    console.log('Testing #inpCodigo with PSL560...');
    await page.locator('#inpCodigo').first().fill('PSL560');
    await page.locator('#btnBuscar').first().click();
    await page.waitForTimeout(4000);
    const bodyText1 = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    console.log('Results text for #inpCodigo:', bodyText1.replace(/\n+/g, ' '));

    console.log('Testing #inpPeca with PSL560...');
    await page.locator('#inpCodigo').first().fill('');
    await page.locator('#inpPeca').first().fill('PSL560');
    await page.locator('#btnBuscar').first().click();
    await page.waitForTimeout(4000);
    const bodyText2 = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    console.log('Results text for #inpPeca:', bodyText2.replace(/\n+/g, ' '));

    await browser.close();
}

testSkyInputs().catch(console.error);
