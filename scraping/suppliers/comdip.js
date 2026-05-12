module.exports = {
    key: 'comdip',
    matches: (supplierName) => supplierName.includes('comdip'),
    authenticatedUrl: 'https://portalcomdip.com.br/comdip/compras',
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]', '#Cnpj', '#Login'],
    passSelector: ['input[id="pass"]', 'input[type="password"]'],
    submitSelector: ['button:has-text("Entrar")', 'button:has-text("Login")', 'button.btn-success'],
    loginSuccessSelector: ['a:has-text("Meu histÃ³rico")', 'a:has-text("Minhas Listas")', 'text=OFICINA DO'],
    searchSelector: ['input[type="search"]', 'input[placeholder*="nome" i]', 'input[placeholder*="marca" i]', '.search-input'],
    searchButtonSelector: ['button[type="submit"]', 'button .fa-search', '.fa-search', '.icon-search'],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    emptyResultSelector: ['text=0 itens encontrados', 'text=Nenhum resultado'],
    itemContainerSelector: ['[class*="produto"]', '[class*="item"]', '[class*="card"]', 'article', 'li'],
    productNameSelector: ['h2', 'h3', 'h4', 'a', 'strong', 'span'],
    priceSelector: ['.price', '.valor', '[class*="price"]', '[class*="valor"]'],
    buildSearchUrl: (query) => `https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/${encodeURIComponent(String(query).toLowerCase())}/1`,
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('[class*="produto"], [class*="item"], [class*="card"], article, li')).slice(0, 300);
            const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const seen = new Set();
            const items = [];

            for (const el of candidates) {
                const text = normalize(el.textContent || '');
                const priceMatch = text.match(/R\$\s?[0-9.,]+/);
                if (!priceMatch) continue;

                const rawNameCandidates = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, a, strong, span'))
                    .map((node) => normalize(node.textContent || ''))
                    .filter(Boolean);

                const nome =
                    rawNameCandidates.find((value) => /[A-Za-z]/.test(value) && !/^R\$\s?[0-9.,]+$/.test(value) && value.length > 6)
                    || text.split('R$')[0].trim();

                if (!nome) continue;

                const key = `${nome}|${priceMatch[0]}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const linkNode = el.querySelector('a[href]');
                items.push({
                    nome,
                    preco: priceMatch[0],
                    codigo: (text.match(/([A-Z0-9-]{4,})/) || [null, ''])[1],
                    link: linkNode ? linkNode.href : '',
                });
            }

            return items.slice(0, 24);
        });
    },
    beforeLogin: async ({ dismissTransientUi, setCheckboxState }) => {
        await dismissTransientUi();
        await setCheckboxState(['input[type="checkbox"]'], true);
    },
};
