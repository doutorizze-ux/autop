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
    extractItems: async ({ page, query }) => {
        await page.waitForFunction(() => {
            const text = String(document.body?.innerText || '');
            const productRoots = Array.from(document.querySelectorAll(
                'li.item.product.product-item, .products-grid .product-item, .products-list .product-item'
            ));
            const hasProductPrice = productRoots.some((root) => (
                /R\$\s*[0-9.]+,\d{2}/.test(String(root.textContent || ''))
            ));
            const normalizedText = text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            const hasEmptyResult =
                /pesquisa\s+nao\s+retornou\s+resultados|nenhum\s+resultado|sem\s+resultado/.test(normalizedText);
            return hasProductPrice || hasEmptyResult;
        }, null, { timeout: 15_000 }).catch(() => {});

        const evaluatedItems = await page.evaluate(async (requestedQuery) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const bodyText = normalize(document.body && document.body.textContent);
        const bodyAvailabilityText = bodyText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/pesquisa\s+nao\s+retornou\s+resultados|nao\s+retornou\s+resultados|nenhum\s+resultado|sem\s+resultado/.test(bodyAvailabilityText)) {
            return [];
        }

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
            const availabilityText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const unavailable = /\bfora\s+de\s+estoque\b|\bsem\s+estoque\b|\bindisponivel\b|\bavise\s*[- ]?me\b|\besgotad[oa]\b/.test(availabilityText);
            if (unavailable) continue;

            const preco =
                parsePriceText(text)
                || parsePriceText(getText(root, ['.price-box', '.special-price', '.regular-price', '[class*="price"]']))
                || parsePriceText(Array.from(root.querySelectorAll('span, strong, div, p')).map((node) => normalize(node.textContent || '')).join(' '));
            if (!preco) continue;

            const nome = getText(root, [
                '.product-item-name a',
                '.product-item-link',
                '.product.name a',
                '.product-name',
                'h2',
                'h3',
            ]) || text.split('APLICA')[0].replace(preco, '').trim().split('R$')[0].trim();
            const linkNode = root.querySelector('a[href]');

            items.push({
                nome,
                preco,
                estoque: '',
                estoqueTexto: getText(root, ['.stock', '.availability', '[class*="stock"]']),
                textoCompleto: text,
                link: linkNode ? linkNode.href : window.location.href,
            });
        }

        if (items.length) {
            return items;
        }

        let priceIntegration = null;
        const integrationScripts = Array.from(document.querySelectorAll('script[type="text/x-magento-init"]'));
        for (const script of integrationScripts) {
            const source = String(script.textContent || '').trim();
            if (!source.includes('price_integration')) continue;

            try {
                const parsed = JSON.parse(source);
                const current = parsed?.['*']?.price_integration;
                if (Array.isArray(current?.skus) && current.skus.length) {
                    priceIntegration = current;
                    break;
                }
            } catch (_) {
                const skusMatch = source.match(/"skus"\s*:\s*(\[[^\]]*\])/);
                const pricesMatch = source.match(/"prices"\s*:\s*(\[[^\]]*\])/);
                try {
                    const skus = skusMatch ? JSON.parse(skusMatch[1]) : [];
                    const prices = pricesMatch ? JSON.parse(pricesMatch[1]) : [];
                    if (Array.isArray(skus) && skus.length) {
                        priceIntegration = { skus, prices };
                        break;
                    }
                } catch (_) {}
            }
        }

        if (!priceIntegration) {
            return [];
        }

        try {
            const response = await fetch('/preco/index/priceajax', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    skus: priceIntegration.skus,
                    prices: priceIntegration.prices || [],
                }),
            });
            if (!response.ok) {
                return [];
            }

            const payload = await response.json();
            const offers = payload?.result?.estoquesPrecoFlexibilizado;
            if (!Array.isArray(offers)) {
                return [];
            }

            const normalizedQuery = normalize(requestedQuery).toUpperCase();
            return offers.map((offer) => {
                const root = document.getElementById(`product-item-${offer.sku}`);
                const text = normalize(root?.textContent || '');
                const nome = getText(root || document, [
                    '.product-item-name a',
                    '.product-item-link',
                    '.product.name a',
                    '.product-name',
                ]) || normalize(offer.nomeProduto);
                const linkNode = root?.querySelector('a.product-item-link[href], a[href]');
                const codeMatch = text.match(/C[o\u00f3]d(?:igo)?(?:\s+de|\s+do)?\s+Fabricante\s*:?\s*([A-Z0-9./_-]+)/i);
                const brandMatch = text.match(/Fabricante\s*:?\s*([A-Z0-9 .&/-]+?)(?=\s+C[o\u00f3]d|\s*$)/i);
                const code = normalize(codeMatch?.[1])
                    || (normalizedQuery && nome.toUpperCase().includes(normalizedQuery) ? normalize(requestedQuery) : '');

                return {
                    nome,
                    preco: Number(offer.precoFlexibilizado || offer.precoFlexibilizadoTributado || 0),
                    codigo: code,
                    marca: normalize(brandMatch?.[1]),
                    estoque: Number(offer.quantidadeDisponivelEstoque || 0),
                    estoqueTexto: `${Number(offer.quantidadeDisponivelEstoque || 0)} un.`,
                    disponivel: offer.disponivelVenda === 'S' && Number(offer.quantidadeDisponivelEstoque || 0) > 0,
                    textoCompleto: text,
                    link: linkNode?.href || window.location.href,
                };
            }).filter((item) => item.preco > 0 && item.disponivel);
        } catch (_) {
            return [];
        }
        }, query);

        if (evaluatedItems.length) {
            return evaluatedItems;
        }

        const priceIntegration = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script[type="text/x-magento-init"]'));
            for (const script of scripts) {
                const source = String(script.textContent || '');
                if (!source.includes('price_integration')) continue;

                try {
                    const parsed = JSON.parse(source)?.['*']?.price_integration;
                    if (Array.isArray(parsed?.skus) && parsed.skus.length) {
                        return { skus: parsed.skus, prices: parsed.prices || [] };
                    }
                } catch (_) {
                    const skusMatch = source.match(/"skus"\s*:\s*(\[[^\]]*\])/);
                    const pricesMatch = source.match(/"prices"\s*:\s*(\[[^\]]*\])/);
                    try {
                        const skus = skusMatch ? JSON.parse(skusMatch[1]) : [];
                        const prices = pricesMatch ? JSON.parse(pricesMatch[1]) : [];
                        if (Array.isArray(skus) && skus.length) {
                            return { skus, prices };
                        }
                    } catch (_) {}
                }
            }

            const skus = Array.from(document.querySelectorAll('li[id^="product-item-"]'))
                .map((root) => String(root.id || '').replace(/^product-item-/, '').trim())
                .filter(Boolean);
            return skus.length ? { skus: Array.from(new Set(skus)), prices: [] } : null;
        });

        if (!priceIntegration) {
            return [];
        }

        try {
            const response = await page.request.post('https://loja.rmp.com.br/preco/index/priceajax', {
                data: {
                    skus: priceIntegration.skus,
                    prices: priceIntegration.prices,
                },
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    Referer: page.url(),
                },
                timeout: 30000,
            });
            if (!response.ok()) {
                return [];
            }

            const payload = await response.json();
            const offers = payload?.result?.estoquesPrecoFlexibilizado;
            if (!Array.isArray(offers)) {
                return [];
            }

            const metadata = await page.evaluate((skus) => Object.fromEntries(skus.map((sku) => {
                const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
                const root = document.getElementById(`product-item-${sku}`);
                const text = normalize(root?.textContent || '');
                const nameNode = root?.querySelector('.product-item-name a, .product-item-link, .product.name a, .product-name');
                const linkNode = root?.querySelector('a.product-item-link[href], a[href]');
                const code = (text.match(/C[o\u00f3]digo\s+do\s+Fabricante\s*:?\s*([A-Z0-9./_-]+)/i) || [])[1] || '';
                const brandMatches = Array.from(text.matchAll(
                    /Fabricante\s*:?\s*([A-Z0-9 .&/-]+?)(?=\s+(?:Fabricante|C[o\u00f3]d|Aplica|Quantidade|Pre[c\u00e7]o)|\s*$)/gi
                ));
                const brand = brandMatches.at(-1)?.[1] || '';
                return [sku, { name: normalize(nameNode?.textContent), code: normalize(code), brand: normalize(brand), link: linkNode?.href || '' }];
            })), priceIntegration.skus);

            const normalizedQuery = String(query || '').trim().toUpperCase();
            return offers.map((offer) => {
                const details = metadata?.[offer.sku] || {};
                const name = details.name || String(offer.nomeProduto || '').trim();
                const code = details.code || (normalizedQuery && name.toUpperCase().includes(normalizedQuery) ? String(query).trim() : '');
                const stock = Number(offer.quantidadeDisponivelEstoque || 0);
                return {
                    nome: name,
                    preco: Number(offer.precoFlexibilizado || offer.precoFlexibilizadoTributado || 0),
                    codigo: code,
                    marca: details.brand || '',
                    estoque: stock,
                    estoqueTexto: `${stock} un.`,
                    disponivel: offer.disponivelVenda === 'S' && stock > 0,
                    link: details.link || page.url(),
                };
            }).filter((item) => item.preco > 0 && item.disponivel);
        } catch (_) {
            return [];
        }
    },
};
