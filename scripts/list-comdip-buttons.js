const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'networkidle' });
    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button, a.btn, input[type="submit"]')).map(b => ({
        tag: b.tagName,
        text: b.innerText.trim(),
        type: b.type,
        className: b.className,
        visible: b.offsetWidth > 0 && b.offsetHeight > 0
    })));
    console.log('Buttons:', buttons);
    await browser.close();
}
test().catch(console.error);
