const { chromium } = require('../scraping/node_modules/playwright');

async function inspectKaizen() {
    console.log('Launching browser to check Kaizen...');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true
    });
    const page = await browser.newPage();

    console.log('Navigating to Kaizen portal...');
    try {
        await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        console.log('Page title:', await page.title());
        console.log('Current URL:', page.url());
        
        const inputs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input, button')).map(el => ({
                tag: el.tagName,
                type: el.type || '',
                name: el.name || '',
                placeholder: el.placeholder || '',
                text: el.innerText || '',
                className: el.className
            }));
        });
        console.log('Inputs and buttons found:\n', JSON.stringify(inputs, null, 2));

        const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 800));
        console.log('Body snippet:\n', bodySnippet);
    } catch (e) {
        console.error('Error opening Kaizen:', e.message);
    }

    await browser.close();
}

inspectKaizen().catch(console.error);
