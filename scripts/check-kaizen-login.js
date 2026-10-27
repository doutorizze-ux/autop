const { chromium } = require('../scraping/node_modules/playwright');

async function check() {
    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    console.log('Opening Kaizen login...');
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    console.log('Title:', await page.title());
    console.log('Turnstile iframes:', await page.locator('iframe[src*="challenges.cloudflare.com"]').count());
    console.log('Button Entrar disabled?', await page.locator('button:has-text("Entrar")').isDisabled());
    await page.screenshot({ path: 'kaizen-login.png' });
    console.log('Screenshot saved to kaizen-login.png');
    await browser.close();
}
check().catch(console.error);
