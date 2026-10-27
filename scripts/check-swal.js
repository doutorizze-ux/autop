const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function checkSwal() {
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
    await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.locator('#inpCodigo').first().fill('PSL560');
    await page.locator('#btnBuscar').first().click();
    await page.waitForTimeout(2000);

    const swalHtml = await page.evaluate(() => {
        const swal = document.querySelector('.swal2-container');
        return swal ? swal.innerText : 'NO SWAL';
    });
    console.log('SWAL TEXT:', swalHtml.replace(/\n+/g, ' '));
    await browser.close();
}

checkSwal().catch(console.error);
