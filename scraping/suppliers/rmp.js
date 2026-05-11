module.exports = {
    key: 'rmp',
    matches: (supplierName) => supplierName.includes('real moto') || supplierName.includes('rmp'),
    userSelector: [
        'input[name="login[username]"]',
        'input[placeholder*="e-mail" i]',
        'input[placeholder*="telefone" i]',
        'input[placeholder*="cnpj" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[type="email"]',
    ],
    passSelector: [
        'input[name="login[password]"]',
        'input[placeholder*="senha" i]',
        'input[type="password"]',
    ],
    loginSuccessSelector: [
        '.header-search',
        '.welcome-msg',
        'a[href*="logout"]',
        '#search-cod-fab-input',
        '#minisearch-input-top-search',
        'input[placeholder*="codigo" i]',
        'input[placeholder*="descricao" i]',
        'input[placeholder*="marca" i]',
        '.authorization-link',
    ],
    searchSelector: [
        '#search-cod-fab-input',
        '#minisearch-input-top-search',
        'input[placeholder*="codigo" i]',
        'input[placeholder*="descricao" i]',
        'input.busca',
    ],
    searchButtonSelector: ['button.btn-search-fab-cod', 'button:has(.fa-search)', 'button[type="submit"]'],
    itemContainerSelector: [
        'li.item.product.product-item',
        '.product-item',
        '.products .item',
        '.product-item-info',
        '.product.details',
        'article',
    ],
    productNameSelector: [
        '.product-item-name a',
        '.product-item-link',
        '.product.name a',
        '.product-name',
        'h2',
        'h3',
    ],
    priceSelector: [
        '.price-box .price',
        '.special-price .price',
        '.regular-price .price',
        '.price',
        '[class*="price"]',
    ],
    availableSelector: ['.stock', '.availability', '[class*="stock"]'],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    emptyResultSelector: ['.message.notice', '.message.info', '.search.results .message'],
    buildSearchUrl: (query) => {
        const value = String(query).trim();
        const looksLikeCode = /^[A-Za-z0-9-]{3,}$/.test(value) && !/\s/.test(value);
        const codeParam = looksLikeCode ? `&code=${encodeURIComponent(value)}` : '';
        return `https://loja.rmp.com.br/catalogsearch/result/?q=${encodeURIComponent(value)}${codeParam}`;
    },
    extractItems: async ({ page }) => page.evaluate(() => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const parsePriceText = (text) => {
            const match = normalize(text).match(/R\$\s*[0-9.]+,\d{2}/);
            return match ? match[0] : '';
        };
        const getText = (root, selectors) => {
            for (const selector of selectors) {
                const node = root.querySelector(selector);
                const text = normalize(node && node.textContent);
                if (text) return text;
            }
            return '';
        };

        const selectors = [
            'li.item.product.product-item',
            '.product-item',
            '.products .item',
            '.product-item-info',
            '.product.details',
            'article',
        ];
        const roots = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
        const items = [];

        for (const root of roots) {
            const text = normalize(root.textContent);
            const preco = parsePriceText(text);
            if (!preco) continue;

            const nome = getText(root, [
                '.product-item-name a',
                '.product-item-link',
                '.product.name a',
                '.product-name',
                'h2',
                'h3',
            ]) || text.split('APLICA')[0].replace(preco, '').trim();
            const linkNode = root.querySelector('a[href]');

            items.push({
                nome,
                preco,
                estoque: '1',
                link: linkNode ? linkNode.href : window.location.href,
            });
        }

        if (items.length) {
            return items;
        }

        const bodyText = normalize(document.body && document.body.textContent);
        const preco = parsePriceText(bodyText);
        if (!preco) {
            return [];
        }

        const nameMatch = bodyText.match(/([A-Z0-9][A-Z0-9\s./-]{12,}HF\s*87B[A-Z0-9\s./-]*)/i);
        return [{
            nome: normalize(nameMatch ? nameMatch[1] : 'Produto Real Moto Pecas'),
            preco,
            estoque: '1',
            link: window.location.href,
        }];
    }),
};
