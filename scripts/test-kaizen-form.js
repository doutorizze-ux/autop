const { chromium } = require('../scraping/node_modules/playwright');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const kaizen = await prisma.supplier.findFirst({ where: { name: { contains: 'Kaizen' } } });
    console.log('Kaizen credentials in DB:', {
        loginCredential: kaizen.loginCredential,
        hasPassword: !!kaizen.password
    });

    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    console.log('Opening Kaizen login...');
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const userInput = page.locator('input[placeholder*="cnpj" i], input[placeholder*="cpf" i], input[type="text"]').first();
    await userInput.fill(kaizen.loginCredential || '33299637000180');
    await userInput.dispatchEvent('input');
    await userInput.dispatchEvent('change');

    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(kaizen.password || '');
    await passInput.dispatchEvent('input');
    await passInput.dispatchEvent('change');

    await page.waitForTimeout(2000);

    const btn = page.locator('button:has-text("Entrar"), button[type="submit"]').first();
    const disabled = await btn.isDisabled();
    console.log('Button Entrar disabled after filling?', disabled);
    console.log('Iframes on page:', await page.locator('iframe').count());

    if (!disabled) {
        console.log('Clicking Entrar...');
        await btn.click();
        await page.waitForTimeout(5000);
        console.log('After submit URL:', page.url());
        console.log('After submit Title:', await page.title());
        const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log('Body:', bodySnippet.replace(/\s+/g, ' '));
    } else {
        const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log('Body snippet while disabled:', bodySnippet.replace(/\s+/g, ' '));
        const html = await page.evaluate(() => document.querySelector('form')?.innerHTML || document.body.innerHTML.substring(0, 1000));
        console.log('Form HTML:', html);
    }

    await browser.close();
}
check().catch(console.error);
