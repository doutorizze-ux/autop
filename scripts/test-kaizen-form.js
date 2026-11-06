const { chromium } = require('../scraping/node_modules/playwright');

async function inspect() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/');
    await page.waitForTimeout(2000);

    const formHtml = await page.evaluate(() => {
        const form = document.querySelector('form');
        return form ? form.outerHTML : document.body.innerHTML;
    });
    console.log('FORM HTML:\n', formHtml);

    await browser.close();
}

inspect().catch(console.error);
