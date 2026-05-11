module.exports = {
    key: 'kki',
    matches: (supplierName) => supplierName.includes('kki') || supplierName.includes('auto norte'),
    authenticatedUrl: 'https://kki.autonorte.com.br/compras',
    loginSuccessSelector: [
        'button:has-text("Pesquisar")',
        'input[placeholder="Referência"]',
        'input[placeholder="Descrição"]',
        'text=Comprar peças',
    ],
    searchSelector: [
        'input[placeholder="Referência"]',
        'input[placeholder="Descrição"]',
        'form input[type="text"]',
    ],
    searchButtonSelector: [
        'button:has-text("Pesquisar")',
        'button[type="submit"]',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    itemContainerSelector: [
        'div.css-1jay046',
        'div[class*="css-1jay046"]',
    ],
    productNameSelector: [
        'p.css-1rhqd7b',
        'p[class*="css-1rhqd7b"]',
        'h2',
        'h3',
        'strong',
    ],
    priceSelector: ['button', 'span'],
    emptyResultSelector: ['text=Nenhum produto encontrado', 'text=0 resultado', 'text=0 resultados'],
    navigateToAuthenticatedAfterLogin: true,
    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();
        await page.waitForSelector('input[type="text"]', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const referenceSelectors = [
            'input[placeholder="Referência"]',
            'input[placeholder*="referencia" i]',
            'input[placeholder*="codigo" i]',
        ];
        const descriptionSelectors = [
            'input[placeholder="Descrição"]',
            'input[placeholder*="descricao" i]',
        ];
        const fallbackSelectors = ['form input[type="text"]'];

        const findVisibleLocator = async (selectors) => {
            for (const selector of selectors) {
                const locator = page.locator(selector);
                const count = await locator.count().catch(() => 0);
                for (let index = 0; index < count; index += 1) {
                    const current = locator.nth(index);
                    const isVisible = await current.isVisible().catch(() => false);
                    const isEnabled = await current.isEnabled().catch(() => true);
                    if (isVisible && isEnabled) {
                        return current;
                    }
                }
            }

            return null;
        };

        const normalizedQuery = String(query || '').trim();
        const looksLikeCode = /^[A-Za-z0-9./_-]{3,}$/.test(normalizedQuery) && !/\s/.test(normalizedQuery);

        let searchInput = looksLikeCode
            ? await findVisibleLocator(referenceSelectors)
            : await findVisibleLocator(descriptionSelectors);

        if (!searchInput && !looksLikeCode) {
            searchInput = await findVisibleLocator(referenceSelectors);
        }

        if (!searchInput) {
            searchInput = await findVisibleLocator(fallbackSelectors);
        }

        if (!searchInput) {
            throw new Error('Campo de busca do KKI nao encontrado.');
        }

        await fillVisibleLocator(searchInput, query);

        const searchButton = page.locator('button:has-text("Pesquisar"), button[type="submit"]').first();
        if (await searchButton.isVisible().catch(() => false)) {
            await searchButton.click({ force: true }).catch(() => {});
        } else {
            await searchInput.press('Enter').catch(() => {});
        }

        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(1500);
        await page.waitForSelector('div.css-1jay046, div[class*="css-1jay046"]', { timeout: 12000 }).catch(() => {});
        await page.waitForFunction(() => {
            const body = String(document.body?.innerText || '');
            return Boolean(document.querySelector('div.css-1jay046, div[class*="css-1jay046"]'))
                || /distribuido por/i.test(body)
                || /Nenhum produto encontrado/i.test(body);
        }, { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissTransientUi();
    },
    extractItems: async ({ page, supplier }) => {
        return page.evaluate((supplierName) => {
            const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

            const bodyText = clean(document.body?.innerText || document.body?.textContent || '');
            const textResults = [];
            const textPattern = /R\$\s*([0-9.,]+)\s*R\$\s*([0-9.,]+)\s*([A-Z0-9ÇÁÉÍÓÚÃÕ/\- ]+?)\s*Avise-me\s*([A-Z0-9.\-]+)\s+([A-Z0-9.\-\/]+)\s*Transporte:\s*\|?\s*Em estoque:?\s*([0-9]+)/gi;

            for (const match of bodyText.matchAll(textPattern)) {
                const [, currentPrice, oldPrice, productName, brandName, codeValue, stockValue] = match;
                textResults.push({
                    provider: supplierName,
                    nome: clean(productName),
                    preco: clean(currentPrice || oldPrice),
                    codigo: clean(codeValue),
                    marca: clean(brandName),
                    aplicacao: '',
                    estoque: clean(stockValue || '0'),
                    estoqueTexto: `Em estoque:${clean(stockValue || '0')}`,
                    link: window.location.href,
                });
            }

            if (textResults.length > 0) {
                return textResults;
            }

            const directCards = Array.from(document.querySelectorAll('div.css-1jay046, div[class*="css-1jay046"]'));
            const candidateNodes = (directCards.length ? directCards : Array.from(document.querySelectorAll('div, article, li, section'))).filter((node) => {
                const text = clean(node.textContent || '');
                if (!text) return false;
                return /distribuido por/i.test(text) || /R\$\s*[0-9.,]+/.test(text);
            });

            const filteredNodes = candidateNodes.filter((node) => {
                const text = clean(node.textContent || '');
                return text.length > 20 && text.length < 2000;
            });

            const parseCard = (node) => {
                const text = clean(node.textContent || '');
                const priceMatch = text.match(/R\$\s*[0-9.,]+/g);
                const priceText = priceMatch ? clean(priceMatch[priceMatch.length - 1]) : '';
                if (!priceText) return null;

                const lines = String(node.innerText || '')
                    .split(/\n+/)
                    .map((line) => clean(line))
                    .filter(Boolean);

                const distributor = ((text.match(/Distribuido por\s*:?\s*([^\n]+)/i) || [])[1] || '').trim();
                const stockText = ((text.match(/Em estoque:?\s*([0-9]+)/i) || [])[0] || '').trim();
                const stock = ((text.match(/Em estoque:?\s*([0-9]+)/i) || [])[1] || '0').trim();
                const codeLine = lines.find((line) => /^[A-Z0-9]{3,}(?:[-./][A-Z0-9]+)*$/i.test(line)) || '';

                const product = lines.find((line) => {
                    const normalized = line.toLowerCase();
                    if (!line || line === codeLine) return false;
                    if (/^r\$\s*[0-9.,]+/i.test(line)) return false;
                    if (normalized.includes('distribuido por')) return false;
                    if (normalized.includes('em estoque')) return false;
                    if (normalized.includes('ver carrinho')) return false;
                    if (normalized.includes('comprar peças')) return false;
                    if (normalized.includes('lancamentos')) return false;
                    if (normalized.includes('promoção')) return false;
                    if (normalized.includes('promoçao')) return false;
                    if (normalized.includes('placa do veículo')) return false;
                    if (normalized.includes('placa do veiculo')) return false;
                    if (normalized.includes('menor preço')) return false;
                    if (normalized.includes('maior preço')) return false;
                    if (normalized.includes('transporte')) return false;
                    return line.length > 6;
                }) || '';

                const brandLine = lines.find((line) => {
                    const normalized = line.toLowerCase();
                    if (!line || line === product || line === codeLine) return false;
                    if (/^r\$\s*[0-9.,]+/i.test(line)) return false;
                    if (normalized.includes('distribuido por')) return false;
                    if (normalized.includes('em estoque')) return false;
                    if (normalized.includes('ver carrinho')) return false;
                    if (normalized.includes('comprar peças')) return false;
                    if (normalized.includes('lancamentos')) return false;
                    if (normalized.includes('promoção')) return false;
                    if (normalized.includes('promoçao')) return false;
                    if (normalized.includes('placa do veículo')) return false;
                    if (normalized.includes('placa do veiculo')) return false;
                    return line.length > 1 && line.length <= 40;
                }) || '';

                const linkNode = node.querySelector('a[href]');
                const link = linkNode ? linkNode.href : window.location.href;

                if (!product && !codeLine) {
                    return null;
                }

                return {
                    provider: distributor ? `${supplierName} - ${distributor}` : supplierName,
                    nome: product || codeLine,
                    preco: priceText,
                    codigo: clean(codeLine),
                    marca: clean(brandLine),
                    aplicacao: '',
                    estoque: stock,
                    estoqueTexto: stockText,
                    link,
                };
            };

            return filteredNodes.map(parseCard).filter(Boolean);
        }, supplier.name);
    },
};
