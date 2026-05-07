module.exports = {
    key: 'kki',
    matches: (supplierName) => supplierName.includes('kki') || supplierName.includes('auto norte'),
    authenticatedUrl: 'https://kki.autonorte.com.br/compras',
    loginSuccessSelector: [
        'button:has-text("Pesquisar")',
        'input[placeholder*="descricao" i]',
        'input[placeholder*="aplicacao" i]',
        'input[placeholder*="referencia auxiliar" i]',
        'text=Comprar peças',
    ],
    searchSelector: [
        'input[placeholder*="descricao" i]',
        'input[placeholder*="aplicacao" i]',
        'input[placeholder*="referencia auxiliar" i]',
        'form input[type="text"]',
    ],
    searchButtonSelector: [
        'button:has-text("Pesquisar")',
        'button[type="submit"]',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    itemContainerSelector: ['div', 'article'],
    productNameSelector: ['h2', 'h3', 'strong'],
    priceSelector: ['button', 'span', 'div'],
    emptyResultSelector: ['text=Nenhum produto encontrado', 'text=0 resultado', 'text=0 resultados'],
    navigateToAuthenticatedAfterLogin: true,
    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const inputs = page.locator('input[type="text"]');
        const visibleInputs = [];
        const count = await inputs.count().catch(() => 0);

        for (let index = 0; index < count; index += 1) {
            const current = inputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);
            if (isVisible && isEnabled) {
                visibleInputs.push(current);
            }
        }

        const codeInput = visibleInputs[1] || visibleInputs[0];
        if (!codeInput) {
            throw new Error('Campo de busca do KKI nao encontrado.');
        }

        await fillVisibleLocator(codeInput, query);

        const searchButton = page.locator('button:has-text("Pesquisar"), button[type="submit"]').first();
        if (await searchButton.isVisible().catch(() => false)) {
            await searchButton.click({ force: true }).catch(() => {});
        } else {
            await codeInput.press('Enter').catch(() => {});
        }

        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(1200);
        await page.waitForFunction(() => {
            const body = String(document.body?.innerText || '');
            return /Distribu[ií]do por/i.test(body) || /Nenhum produto encontrado/i.test(body);
        }, { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await dismissTransientUi();
    },
    extractItems: async ({ page, supplier }) => {
        return page.evaluate((supplierName) => {
            const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

            const candidateNodes = Array.from(document.querySelectorAll('div, article, li, section')).filter((node) => {
                const text = clean(node.textContent || '');
                if (!text) return false;
                return /distribu[ií]do por/i.test(text) && /R\$\s*[0-9.,]+/.test(text);
            });

            const filteredNodes = candidateNodes.filter((node) => {
                const text = clean(node.textContent || '');
                return text.length > 40 && text.length < 1200;
            });

            const parseCard = (node) => {
                const text = clean(node.textContent || '');
                const prices = Array.from(text.matchAll(/R\$\s*[0-9.,]+/g)).map((match) => clean(match[0]));
                const priceText = prices[prices.length - 1] || prices[0] || '';
                if (!priceText) return null;

                const lines = String(node.innerText || '')
                    .split(/\n+/)
                    .map((line) => clean(line))
                    .filter(Boolean);

                const product = lines.find((line) => {
                    const normalized = line.toLowerCase();
                    if (/^r\$\s*[0-9.,]+/i.test(line)) return false;
                    if (normalized.includes('distribuido por') || normalized.includes('distribuído por')) return false;
                    if (normalized.includes('em estoque')) return false;
                    if (normalized.includes('transporte')) return false;
                    if (normalized.includes('avise-me')) return false;
                    if (normalized.includes('ver carrinho')) return false;
                    if (normalized.includes('comprar peças')) return false;
                    if (normalized.includes('lancamentos')) return false;
                    if (normalized.includes('promocao')) return false;
                    if (normalized.includes('placa do veiculo')) return false;
                    if (normalized.includes('menor preco')) return false;
                    if (normalized.includes('maior preco')) return false;
                    if (/^[A-Z0-9-]{2,}$/.test(line)) return false;
                    return line.length > 6;
                }) || '';

                const brandLine = lines.find((line) => {
                    const normalized = line.toLowerCase();
                    if (!line || line === product) return false;
                    if (normalized.includes('distribuido por') || normalized.includes('distribuído por')) return false;
                    if (normalized.includes('em estoque')) return false;
                    if (normalized.includes('transporte')) return false;
                    if (normalized.includes('avise-me')) return false;
                    if (normalized.includes('lancamentos')) return false;
                    if (normalized.includes('promocao')) return false;
                    if (/^r\$\s*[0-9.,]+/i.test(line)) return false;
                    if (/^[A-Z0-9-]{2,}$/.test(line)) return false;
                    return line.length <= 30;
                }) || '';

                const codeLine = lines.find((line) => /^[A-Z0-9]+(?:[-./][A-Z0-9]+)+$/i.test(line))
                    || ((text.match(/\b([A-Z]{1,5}-[A-Z0-9-]{1,20})\b/i) || [])[1] || '');

                const stockText = ((text.match(/Em estoque:?\s*([0-9]+)/i) || [])[0] || '').trim();
                const stock = ((text.match(/Em estoque:?\s*([0-9]+)/i) || [])[1] || '0').trim();
                const distributor = ((text.match(/Distribu[ií]do por\s*:?\s*([^\n]+)/i) || [])[1] || '').trim();
                const linkNode = node.querySelector('a[href]');
                const link = linkNode ? linkNode.href : window.location.href;

                if (!product) return null;

                return {
                    provider: distributor ? `${supplierName} - ${distributor}` : supplierName,
                    nome: product,
                    preco: priceText,
                    codigo: clean(codeLine),
                    marca: clean(brandLine),
                    aplicacao: '',
                    estoque: stock,
                    estoqueTexto: stockText,
                    link,
                };
            };

            const items = filteredNodes.map(parseCard).filter(Boolean);

            if (items.length > 0) {
                return items;
            }

            const fallbackRows = Array.from(document.querySelectorAll('table tr')).map((row) => {
                const text = clean(row.textContent || '');
                const priceText = ((text.match(/R\$\s*[0-9.,]+/) || [])[0] || '').trim();
                if (!priceText) return null;

                const cells = Array.from(row.querySelectorAll('td')).map((cell) => clean(cell.textContent || ''));
                const product = cells.find((cell) => cell.length > 6 && !/R\$\s*[0-9.,]+/.test(cell)) || '';
                const code = ((text.match(/\b([A-Z]{1,5}-[A-Z0-9-]{1,20})\b/i) || [])[1] || '').trim();
                const stock = ((text.match(/([0-9]+)\s*$/) || [])[1] || '0').trim();
                const linkNode = row.querySelector('a[href]');

                if (!product) return null;

                return {
                    provider: supplierName,
                    nome: product,
                    preco: priceText,
                    codigo: code,
                    marca: '',
                    aplicacao: '',
                    estoque: stock,
                    estoqueTexto: stock ? `Em estoque: ${stock}` : '',
                    link: linkNode ? linkNode.href : window.location.href,
                };
            }).filter(Boolean);

            return fallbackRows;
        }, supplier.name);
    },
};
