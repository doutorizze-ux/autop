const { chromium } = require('../scraping/node_modules/playwright');
const fs = require('fs');

async function testAutoNorteSearch() {
    const session = JSON.parse(fs.readFileSync('scraping/sessions/auto-norte-kki.json', 'utf8'));
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
    console.log('Navigating to Auto Norte compras...');
    await page.goto('https://kki.autonorte.com.br/compras', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Click "Atualizar" if visible
    const atualizar = page.locator('button:has-text("Atualizar")').first();
    if (await atualizar.isVisible().catch(() => false)) {
        console.log('Clicking Atualizar banner...');
        await atualizar.click().catch(() => {});
        await page.waitForTimeout(3000);
    }

    const refInput = page.locator('input[placeholder="Referência"]').first();
    console.log('Typing PSL560 into Referência...');
    await refInput.fill('PSL560');
    await page.locator('button:has-text("Pesquisar")').first().click();
    await page.waitForTimeout(4000);

    const cardsRef = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div.css-m8wze7, div[class*="css-m8wze7"]'));
        return els.map(e => e.innerText.replace(/\n+/g, ' '));
    });
    console.log(`Results for Referência PSL560 (${cardsRef.length}):`, cardsRef.slice(0, 3));

    // Now clear and try "Descrição"
    await page.locator('button:has-text("Limpar")').first().click().catch(() => {});
    await page.waitForTimeout(1000);

    const descInput = page.locator('input[placeholder="Descrição"]').first();
    console.log('Typing PSL560 into Descrição...');
    await descInput.fill('PSL560');
    await page.locator('button:has-text("Pesquisar")').first().click();
    await page.waitForTimeout(4000);

    const cardsDesc = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div.css-m8wze7, div[class*="css-m8wze7"]'));
        return els.map(e => e.innerText.replace(/\n+/g, ' '));
    });
    console.log(`Results for Descrição PSL560 (${cardsDesc.length}):`, cardsDesc.slice(0, 3));

    // Try "filtro gol"
    await page.locator('button:has-text("Limpar")').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    console.log('Typing W712 into Referência...');
    await page.locator('input[placeholder="Referência"]').first().fill('W712');
    await page.locator('button:has-text("Pesquisar")').first().click();
    await page.waitForTimeout(4000);

    const cardsW712 = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div.css-m8wze7, div[class*="css-m8wze7"]'));
        return els.map(e => e.innerText.replace(/\n+/g, ' '));
    });
    console.log(`Results for Referência W712 (${cardsW712.length}):`, cardsW712.slice(0, 3));

    await browser.close();
}

testAutoNorteSearch().catch(console.error);
