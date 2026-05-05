module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'button.btn-buscar', 'input[formcontrolname="descricao"]'],
    searchSelector: ['input[formcontrolname="descricao"]', 'input[role="search"]', 'input[placeholder*="codigo ou descricao" i]'],
    searchButtonSelector: ['button.btn-buscar', 'button:has-text("Buscar")', '.btn-buscar'],
    buildSearchUrl: (query) => `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`,
    performSearch: async ({ page, query }) => {
        const targetUrl = `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(4000);
    },
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const findText = (root, selectors) => {
                for (const selector of selectors) {
                    try {
                        const node = root.querySelector(selector);
                        if (!node) continue;
                        const text = normalize(node.textContent || '');
                        if (text) return text;
                    } catch (_) {}
                }
                return '';
            };

            const cards = Array.from(document.querySelectorAll('mat-card, .product-item, .card-produto, .grid-produto, tr.mat-row'));
            const items = [];

            for (const card of cards) {
                const text = normalize(card.textContent || '');
                if (!text) continue;

                const priceText =
                    findText(card, ['.price', '.preco', '.valor', '[class*="price"]', '[class*="preco"]', '[class*="valor"]'])
                    || ((text.match(/R\$\s*[0-9.,]+/) || [])[0] || '');

                if (!priceText || /ver preco/i.test(priceText)) continue;

                const product =
                    findText(card, ['.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]', 'td.mat-column-descricao'])
                    || normalize(text.split('R$')[0]);

                const code =
                    ((text.match(/C[oó]d(?:\.|igo)?\s*(?:de)?\s*F[aá]brica:\s*([A-Z0-9./_-]+)/i) || [])[1] || '')
                    || ((text.match(/SKU:\s*([A-Z0-9./_-]+)/i) || [])[1] || '')
                    || ((text.match(/C[oó]d(?:\.|igo)?\s*(?:do)?\s*Produto:\s*([A-Z0-9./_-]+)/i) || [])[1] || '');

                const brand = ((text.match(/Fabricante:\s*([^\n]+)/i) || [])[1] || '').trim();
                const stock = ((text.match(/(?:Estoque|Saldo|Dispon[ií]vel|Qtd)\s*:?\s*([0-9]+)/i) || [])[1] || '0').trim();

                items.push({
                    nome: product,
                    preco: priceText,
                    codigo: code,
                    marca: brand,
                    estoque: stock,
                    link: window.location.href,
                });
            }

            return items;
        });
    },
    itemContainerSelector: ['mat-card', '.product-item', '.card-produto', 'tr.mat-row', '.grid-produto', '.lista-produtos .item'],
    productNameSelector: ['.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]', 'td.mat-column-descricao'],
    priceSelector: ['.price', '.valor', '.preco', 'td.mat-column-preco'],
    codeSelector: ['.codigo-produto', '.ref', '.sku'],
    waitForResultsOnly: true,
    emptyResultSelector: ['text="Nao encontramos resultados"', '.sem-resultados', 'text="0 resultados"', 'text="Pesquisa por:"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true,
};
