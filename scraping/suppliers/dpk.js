module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'button.btn-buscar', 'input[formcontrolname="descricao"]'],
    searchSelector: ['input[formcontrolname="descricao"]', 'input[role="search"]', 'input[placeholder*="codigo ou descricao" i]'],
    searchButtonSelector: ['button.btn-buscar', 'button:has-text("Buscar")', '.btn-buscar'],
    buildSearchUrl: (query) => `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`,
    needsLogin: false,
    usesOwnProxy: true,

    performSearch: async ({ page, query }) => {
        const proxyKey = process.env.SCRAPERAPI_KEY;
        const targetUrl = `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;

        if (proxyKey) {
            console.error(`[DEBUG DPK] Usando ScraperAPI para: ${targetUrl}`);
            const tunnelUrl = `http://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=br`;

            await page.goto(tunnelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async (error) => {
                console.error(`[DEBUG DPK] Erro no tunel: ${error.message}. Tentando acesso direto.`);
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            });
        } else {
            console.error('[DEBUG DPK] Sem SCRAPERAPI_KEY. Tentando acesso direto.');
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        }

        await Promise.race([
            page.locator('mat-card, .product-item, .card-produto, .grid-produto').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null),
            page.locator('text="Nao encontramos resultados", text="Pesquisa por:"').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null),
        ]).catch(() => null);
    },

    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('mat-card, .product-item, .card-produto, .grid-produto');

            cards.forEach((card) => {
                const text = card.innerText || '';
                const nameNode = card.querySelector('.product-name, .product-title, .descricao-produto, a[href*="#/produtos/"]');
                const name = nameNode ? nameNode.innerText.trim() : '';

                if (!name && text.length > 10) return;

                const priceNode = card.querySelector('button:has-text("Ver preco"), button:has-text("Ver preço"), .price, .preco, .valor');
                const priceText = priceNode ? priceNode.innerText : '0';
                const codeMatch = text.match(/Cod de Fabrica:\s*([A-Z0-9.-]+)/i) || text.match(/Cod\. de Fabrica:\s*([A-Z0-9.-]+)/i);
                const skuMatch = text.match(/Cod\. do Produto:\s*([0-9]+)/i) || text.match(/SKU:\s*([0-9]+)/i);
                const brandMatch = text.match(/Fabricante:\s*([^\n]+)/i);

                items.push({
                    nome: name || text.split('\n')[0],
                    preco: /ver pre/i.test(priceText) ? '' : priceText,
                    codigo: codeMatch ? codeMatch[1] : (skuMatch ? skuMatch[1] : ''),
                    marca: brandMatch ? brandMatch[1].trim() : '',
                    estoque: '1',
                    link: window.location.href,
                });
            });

            return items;
        });
    },

    itemContainerSelector: ['mat-card', '.product-item', '.card-produto', 'tr.mat-row', '.grid-produto', '.lista-produtos .item'],
    productNameSelector: ['.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]', 'td.mat-column-descricao'],
    priceSelector: ['.price', '.valor', '.preco', 'button:has-text("Ver preco")', 'button:has-text("Ver preço")', 'td.mat-column-preco'],
    codeSelector: ['.codigo-produto', '.ref', '.sku'],
    waitForResultsOnly: true,
    emptyResultSelector: ['text="Nao encontramos resultados"', '.sem-resultados', 'text="0 resultados"', 'text="Pesquisa por:"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true,
};
