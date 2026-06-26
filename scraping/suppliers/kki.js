module.exports = {
    key: 'kki',
    matches: (supplierName) => supplierName.includes('kki') || supplierName.includes('auto norte'),
    authenticatedUrl: 'https://kki.autonorte.com.br/compras',
    loginSuccessSelector: [
        'button:has-text("Pesquisar")',
        'button:has-text("Buscar")',
        'text=Comprar peças',
        'text=Comprar peÃƒÂ§as',
        'input[placeholder*="refer" i]',
        'input[placeholder*="descr" i]',
        'input[placeholder*="codigo" i]',
        'input[placeholder*="descricao" i]',
    ],
    searchSelector: [
        'input[placeholder*="refer" i]',
        'input[placeholder*="descr" i]',
        'input[placeholder*="codigo" i]',
        'input[placeholder*="descricao" i]',
        'input[type="search"]',
        'form input[type="text"]',
    ],
    searchButtonSelector: [
        'button:has-text("Pesquisar")',
        'button:has-text("Buscar")',
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
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const emailField = page.locator(
            'input[type="email"], input[placeholder*="digite seu e-mail" i], input[placeholder*="e-mail" i], input[placeholder*="email" i], input[name*="email" i], input[name*="login" i]'
        ).first();
        const passField = page.locator(
            'input[type="password"], input[placeholder*="digite sua senha" i], input[placeholder*="senha" i], input[name*="senha" i]'
        ).first();

        const hasVisibleLoginFields =
            await emailField.isVisible().catch(() => false)
            || await passField.isVisible().catch(() => false);

        if (!hasVisibleLoginFields) {
            const openButtons = [
                'button:has-text("Já tenho conta")',
                'button:has-text("Ja tenho conta")',
                'button:has-text("Entrar")',
                'a:has-text("Já tenho conta")',
                'a:has-text("Ja tenho conta")',
                'a:has-text("Entrar")',
            ];

            for (const selector of openButtons) {
                const locator = page.locator(selector).first();
                if (await locator.isVisible().catch(() => false)) {
                    await locator.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(800);
                    break;
                }
            }
        }

        if (await emailField.isVisible().catch(() => false)) {
            await fillVisibleLocator(emailField, supplier.loginCredential || supplier.loginExtraValue || '');
        }

        if (await passField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passField, supplier.password || '');
        }
    },
    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();
        await page.waitForSelector('input:not([type="hidden"])', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const visibleSelectors = [
            'input[placeholder*="refer" i]',
            'input[placeholder*="descr" i]',
            'input[placeholder*="codigo" i]',
            'input[placeholder*="descricao" i]',
            'input[type="search"]',
            'form input[type="text"]',
            'input:not([type="hidden"])',
        ];

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

        const searchInput = await findVisibleLocator(visibleSelectors);
        if (!searchInput) {
            throw new Error('Campo de busca do KKI nao encontrado.');
        }

        await fillVisibleLocator(searchInput, query);

        const searchButton = page.locator('button:has-text("Pesquisar"), button:has-text("Buscar"), button[type="submit"]').first();
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
        await page.waitForTimeout(2500);
        await dismissTransientUi();
    },
    extractItems: async ({ page, supplier }) => {
        return page.evaluate((supplierName) => {
            const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

            const bodyText = clean(document.body?.innerText || document.body?.textContent || '');
            const textResults = [];
            const textPattern = /R\$\s*([0-9.,]+)\s*R\$\s*([0-9.,]+)\s*([A-Z0-9Ã‡ÃÃ‰ÃÃ“ÃšÃƒÃ•/\- ]+?)\s*Avise-me\s*([A-Z0-9.\-]+)\s+([A-Z0-9.\-\/]+)\s*Transporte:\s*\|?\s*Em estoque:?\s*([0-9]+)/gi;

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
            const candidateNodes = (directCards.length ? directCards : Array.from(document.querySelectorAll('div, article, li, section')))
                .filter((node) => {
                    const text = clean(node.textContent || '');
                    if (!text) return false;
                    return /distribuido por/i.test(text) || /R\$\s*[0-9.,]+/.test(text);
                });

            const filteredNodes = candidateNodes.filter((node) => {
                const text = clean(node.textContent || '');
                return text.length > 20 && text.length < 2500;
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
                    if (normalized.includes('promocao')) return false;
                    if (normalized.includes('placa do veiculo')) return false;
                    if (normalized.includes('menor preco')) return false;
                    if (normalized.includes('maior preco')) return false;
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
                    if (normalized.includes('promocao')) return false;
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
