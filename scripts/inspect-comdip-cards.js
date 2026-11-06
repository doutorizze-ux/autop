const { chromium } = require('../scraping/node_modules/playwright');

async function inspectCardDetails() {
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

    const cards = await page.evaluate(() => {
        const elements = document.querySelectorAll('isthmus-produto-b2b-card, .produto-card');
        const results = [];
        for (const el of elements) {
            const rawText = el.innerText || '';
            const nomeEl = el.querySelector('.card-nome');
            const nome = (nomeEl ? nomeEl.innerText : '').trim();
            const priceMatch = rawText.match(/R\$\s?[0-9.,]+/);
            const codigoMatch = nome.match(/^([A-Za-z0-9/_-]+)\s*-\s*(.+)/);
            
            // Check stock or indisponivel
            const isIndisponivel = rawText.toLowerCase().includes('indisponível') || rawText.toLowerCase().includes('avise-me');
            
            // Find brand/fabricante
            const marcaMatch = rawText.match(/(MANN\s*HUMMEL|WEGA|FRAM|TECFIL|SEINECA|[A-Z\s]{4,}LTDA)/i);

            results.push({
                rawText: rawText.replace(/\n+/g, ' | '),
                nome: nome || rawText.split('\n')[0],
                codigo: codigoMatch ? codigoMatch[1].trim() : (nome.split(' ')[0] || ''),
                descricao: codigoMatch ? codigoMatch[2].trim() : nome,
                preco: priceMatch ? priceMatch[0] : null,
                marca: marcaMatch ? marcaMatch[0].trim() : '',
                disponivel: !isIndisponivel,
            });
        }
        return results;
    });

    console.log('Cards extracted:', JSON.stringify(cards, null, 2));
    await browser.close();
}

inspectCardDetails().catch(console.error);
