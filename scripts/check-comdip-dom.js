const { chromium } = require('../scraping/node_modules/playwright');

async function checkComdipDOM() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://portalcomdip.com.br/comdip/catalogo/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
    await emailField.fill('33.299.637/0001-80');
    const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
    await passField.fill('Re539597@');

    const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
    if (await consent.isVisible()) await consent.click({ force: true });

    await page.locator('button.btn-parametro, button:has-text("Entrar")').first().click();
    await page.waitForTimeout(6000);

    await page.goto('https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/w712/1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const info = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        let targetEl = null;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes('W7122')) {
                targetEl = node.parentElement;
                break;
            }
        }
        if (!targetEl) return { found: false };

        let curr = targetEl;
        const parents = [];
        for (let i = 0; i < 8 && curr; i++) {
            parents.push({
                tag: curr.tagName,
                className: curr.className,
                id: curr.id
            });
            curr = curr.parentElement;
        }

        return {
            found: true,
            targetTag: targetEl.tagName,
            targetClass: targetEl.className,
            targetText: targetEl.innerText,
            parents
        };
    });

    console.log('Result:', JSON.stringify(info, null, 2));
    await browser.close();
}

checkComdipDOM().catch(console.error);
