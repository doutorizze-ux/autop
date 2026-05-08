module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'button.btn-buscar', 'input[formcontrolname="descricao"]'],
    searchSelector: [
        'input[formcontrolname="descricao"]',
        'input[role="search"]',
        'input[placeholder*="código ou descrição" i]',
        'input[placeholder*="codigo ou descricao" i]',
    ],
    searchButtonSelector: ['button.btn-buscar', '.btn-buscar'],
    buildSearchUrl: (query) => `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`,
    performSearch: async ({ page, query }) => {
        const targetUrl = `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
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

            const cards = Array.from(document.querySelectorAll('div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card'));
            const items = [];

            for (const card of cards) {
                const text = normalize(card.textContent || '');
                if (!text) continue;

                const product = findText(card, ['h2.mat-h4', 'h2', '.mat-h4']);
                const priceText =
                    findText(card, ['span.cor-preco', 'div.preco span.cor-preco', '.preco .cor-preco'])
                    || ((text.match(/R\$\s*[0-9.,]+/) || [])[0] || '');

                if (!product || !priceText) continue;

                const stockText = findText(card, ['div.estoque', '.estoque']);
                const brandNode = Array.from(card.querySelectorAll('div.informacoes p strong, p strong, strong')).find((node) => {
                    const parentText = normalize(node.parentElement?.textContent || '');
                    return /fabricante/i.test(parentText);
                });
                const factoryCodeNode = Array.from(card.querySelectorAll('div.fab strong, div.informacoes strong, strong')).find((node) => {
                    const parentText = normalize(node.parentElement?.textContent || '');
                    return /c[oó]d\.\s*de\s*f[aá]brica/i.test(parentText);
                });
                const productCodeText = text.match(/C[oó]d\.\s*do\s*Produto:\s*([A-Z0-9./_-]+)/i);

                const brand = normalize(brandNode?.textContent || '') || ((text.match(/Fabricante:\s*([^\n]+)/i) || [])[1] || '').trim();
                const code = normalize(factoryCodeNode?.textContent || '') || (productCodeText ? productCodeText[1] : '');
                const stock = ((stockText.match(/([0-9]+)\s*un/i) || [])[1] || (text.match(/([0-9]+)\s*un\.?\s*no estoque/i) || [])[1] || '0').trim();

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
    itemContainerSelector: ['div.cardsAlinhamento > mat-card.produto-card', 'mat-card.produto-card'],
    productNameSelector: ['h2.mat-h4', 'h2', '.mat-h4'],
    priceSelector: ['span.cor-preco', 'div.preco span.cor-preco', '.preco .cor-preco'],
    codeSelector: ['div.fab strong', 'div.informacoes strong'],
    waitForResultsOnly: true,
    emptyResultSelector: ['text="Nao encontramos resultados"', '.sem-resultados', 'text="0 resultados"', 'text="Pesquisa por:"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true,
};
