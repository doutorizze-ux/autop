const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Preenche CNPJ e senha
    const userInput = page.locator('input[placeholder*="cnpj" i], input[type="text"]').first();
    await userInput.fill('33299637000180');
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill('Re539597@');

    await page.waitForTimeout(2000);

    // Turnstile locator
    const turnstileBox = page.locator('div[class*="cloudflareWidget"], iframe[src*="challenges.cloudflare.com"]').first();
    console.log('Turnstile box visible?', await turnstileBox.isVisible());
    if (await turnstileBox.isVisible()) {
        const box = await turnstileBox.boundingBox();
        console.log('Turnstile bounding box:', box);
        if (box) {
            // Click right where the checkbox is (usually x + 30, y + height/2)
            console.log('Clicking Turnstile at:', box.x + 30, box.y + box.height / 2);
            await page.mouse.click(box.x + 30, box.y + box.height / 2);
            await page.waitForTimeout(3000);
        }
    }

    const btn = page.locator('button:has-text("Entrar")').first();
    console.log('Button disabled?', await btn.isDisabled());
    if (!await btn.isDisabled()) {
        await btn.click();
        console.log('Clicked Entrar!');
        await page.waitForTimeout(5000);
        console.log('URL after submit:', page.url());
    }

    await browser.close();
}
test().catch(console.error);
