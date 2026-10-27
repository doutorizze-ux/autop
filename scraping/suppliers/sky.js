const SEARCH_SELECTORS = [
    'input[placeholder*="descricao da peca" i]',
    'input[placeholder*="descricao da pe" i]',
    'input[placeholder*="codigo da peca" i]',
    'input[placeholder*="codigo" i]',
];

const SEARCH_BUTTON_SELECTORS = [
    '#btnBuscar',
    'button:has-text("Buscar")',
    'button[type="submit"]',
];

function normalizeLabel(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

async function findVisibleSearchInput(page) {
    for (const selector of SEARCH_SELECTORS) {
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
}

async function clickVisibleSearchButton(page) {
    for (const selector of SEARCH_BUTTON_SELECTORS) {
        const locator = page.locator(selector);
        const count = await locator.count().catch(() => 0);
        for (let index = 0; index < count; index += 1) {
            const current = locator.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);
            if (isVisible && isEnabled) {
                await current.click({ force: true }).catch(() => {});
                return true;
            }
        }
    }
    return false;
}

function looksLikeCodeQuery(query) {
    const normalized = String(query || '').trim();
    if (!normalized) return false;
    return /^[A-Za-z0-9./_-]{4,}$/.test(normalized) && /\d/.test(normalized);
}

async function pickSearchInput(page, query) {
    const codeLike = looksLikeCodeQuery(query);
    const selectors = codeLike
        ? ['#inpCodigo', 'input[placeholder*="codigo da peca" i]', 'input[placeholder*="codigo" i]', '#inpPeca']
        : ['#inpPeca', 'input[placeholder*="descricao da peca" i]', 'input[placeholder*="descricao da pe" i]', '#inpCodigo'];

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

    return findVisibleSearchInput(page);
}

async function waitForSearchRender(page, previousSignature = '') {
    await page.waitForFunction((initialSignature) => {
        const bodyText = String(document.body?.innerText || '');
        const resultContainer = document.querySelector('#tb_produto');
        const currentSignature = String(resultContainer?.innerHTML || '');
        const hasCards = document.querySelectorAll('#tb_produto .bx_produto').length > 0;
        const hasEmptyMessage = /nenhum|nao encontrado|n\u00e3o encontrado/i.test(bodyText);
        const stillLoading = /carregando/i.test(bodyText);
        const resultChanged = currentSignature !== initialSignature;
        return !stillLoading && resultChanged && (hasCards || hasEmptyMessage || currentSignature.length > 0);
    }, previousSignature, { timeout: 12000 }).catch(() => {});

    await page.waitForTimeout(1200);
}

async function runBranchSearch(page, query, dismissTransientUi) {
    console.log('[SKY DEBUG] runBranchSearch called with query:', query, 'url:', page.url());
    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    try {
        const swalBtn = page.locator('button.swal2-confirm, button.swal2-close, .swal2-actions button, button:has-text("OK")').first();
        if (await swalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await swalBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
        }
    } catch (_) {}

    const inp = page.locator('#inpCodigo').first();
    await inp.click({ force: true });
    await inp.fill(String(query || ''));
    await inp.dispatchEvent('input');
    await inp.dispatchEvent('change');

    const btn = page.locator('#btnBuscar').first();
    console.log('[SKY DEBUG] Clicking #btnBuscar...');
    await btn.click({ force: true });
    await page.waitForTimeout(4000);
    const count = await page.locator('.bx_produto').count();
    console.log('[SKY DEBUG] .bx_produto found right after click:', count);

    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    return true;
}

async function resolveBranchSelect(page) {
    const branchLocator = page.locator('#bx_loja select, select#inpLoja, .fright select').first();
    if (await branchLocator.isVisible().catch(() => false)) {
        const options = await branchLocator.locator('option').evaluateAll((nodes) =>
            nodes.map((node) => ({
                value: String(node.value || '').trim(),
                label: String(node.textContent || '').trim(),
            }))
        ).catch(() => []);
        return { locator: branchLocator, options: options.filter(o => o.label) };
    }
    return null;
}

async function getSelectedBranchLabel(selectLocator) {
    return selectLocator.evaluate((node) => {
        const select = node;
        const option = select.options[select.selectedIndex];
        return option ? String(option.textContent || '').trim() : '';
    }).catch(() => '');
}

async function extractBranchResults(page, providerName) {
    return page.evaluate(({ providerName }) => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const firstPrice = (text) => {
            const match = clean(text).match(/R\$\s*[0-9.]+,\d{2}/);
            return match ? match[0] : '';
        };

        const parseProductCards = () => {
            const cards = Array.from(document.querySelectorAll('#tb_produto .bx_produto, .bx_produto'));
            console.log('[SKY BROWSER] parseProductCards found:', cards.length);
            return cards.map((card) => {
                const rawText = String(card.innerText || '');
                const cleanText = clean(rawText);
                const priceMatch = rawText.match(/R\$\s*([0-9.,]+)/);
                if (!priceMatch) return null;
                const price = clean(priceMatch[1]);

                const fabCodeMatch = rawText.match(/C[oó]d\.?\s*F[aá]b\.?:\s*([^\s\t\n]+)/i);
                const nnCodeMatch = rawText.match(/N\/N:\s*([^\s\t\n]+)/i);
                const auxCodeMatch = rawText.match(/C[oó]d\.?\s*Aux:\s*([^\s\t\n]+)/i);
                const codigo = (fabCodeMatch ? fabCodeMatch[1] : (nnCodeMatch ? nnCodeMatch[1] : '')) || '';

                const stockMatch = rawText.match(/Estoque:\s*([0-9]+)/i);
                const isIndisponivel = /indisponivel|fora de estoque/i.test(rawText);
                const stock = stockMatch ? stockMatch[1] : (isIndisponivel ? '0' : '1');

                const lines = rawText.split('\n').map(clean).filter(Boolean);
                const titleLine = lines[0] || '';
                const parts = titleLine.split('-');
                const nome = clean(parts[0] || titleLine);
                const marca = clean(parts[1] || (lines.find(l => /MANN|WEGA|FRAM|TECFIL/i.test(l)) || ''));

                const linkNode = card.querySelector('a[href]');

                return {
                    provider: providerName,
                    nome: `${nome} ${marca} ${codigo}`.trim(),
                    preco: `R$ ${price}`,
                    codigo,
                    marca,
                    estoque: stock,
                    estoqueTexto: `Estoque: ${stock}`,
                    link: linkNode ? linkNode.href : window.location.href,
                };
            }).filter(Boolean);
        };

        const parseTableRows = () => {
            const results = [];
            const tables = Array.from(document.querySelectorAll('table'));

            for (const table of tables) {
                const headerNodes = Array.from(table.querySelectorAll('thead th'));
                const headers = headerNodes.length
                    ? headerNodes.map((node) => clean(node.textContent))
                    : Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td')).map((node) => clean(node.textContent));

                const headerText = headers.join(' ').toLowerCase();
                const looksLikeProductTable =
                    headerText.includes('descr')
                    || headerText.includes('peca')
                    || headerText.includes('produto')
                    || headerText.includes('valor')
                    || headerText.includes('estoque');

                if (!looksLikeProductTable) continue;

                const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
                for (const row of bodyRows) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const values = cells.map((cell) => clean(cell.textContent));
                    const merged = clean(values.join(' '));
                    const price = values.find((value) => /R\$\s*[0-9.,]+/.test(value)) || ((merged.match(/R\$\s*[0-9.,]+/) || [])[0] || '');
                    if (!price) continue;

                    const codeIndex = headers.findIndex((header) => /cod|ref|fab/i.test(header));
                    const nameIndex = headers.findIndex((header) => /descr|produto|peca/i.test(header));
                    const stockIndex = headers.findIndex((header) => /estoque|saldo|dispon|qtd/i.test(header));
                    const brandIndex = headers.findIndex((header) => /marca/i.test(header));

                    const nameCandidates = values.filter((value) => value && !/R\$\s*[0-9.,]+/.test(value) && !/^\d+$/.test(value));
                    const product = clean((nameIndex >= 0 ? values[nameIndex] : '') || nameCandidates[0] || merged.split('R$')[0]);
                    const code = clean((codeIndex >= 0 ? values[codeIndex] : '') || ((merged.match(/(?:Cod(?:igo)?|Ref|Fab)[:\s-]*([A-Za-z0-9./_-]+)/i) || [])[1] || ''));
                    const stockSource = clean((stockIndex >= 0 ? values[stockIndex] : '') || ((merged.match(/(?:Estoque|Saldo|Disponivel|Disponivel em estoque|Qtd)[:\s-]*([0-9]+)/i) || [])[1] || '0'));
                    const brand = clean((brandIndex >= 0 ? values[brandIndex] : '') || ((merged.match(/Marca[:\s-]*([^\n]+)/i) || [])[1] || ''));
                    const stock = (stockSource.match(/[0-9]+/) || ['0'])[0];
                    const linkNode = row.querySelector('a[href]');

                    results.push({
                        provider: providerName,
                        nome: product,
                        preco: price,
                        codigo: code,
                        marca: brand,
                        estoque: stock,
                        link: linkNode ? linkNode.href : '',
                    });
                }
            }

            return results;
        };

        const fallbackCards = () => {
            const nodes = Array.from(document.querySelectorAll('tr, article, .produto, .item, .card, .product-card, li, .resultado-item'));
            return nodes.map((node) => {
                const text = clean(node.textContent);
                const price = (text.match(/R\$\s*[0-9.,]+/) || [])[0] || '';
                if (!price) return null;

                const lines = text.split(/\n+/).map((line) => clean(line)).filter(Boolean);
                const product = lines.find((line) => !/R\$\s*[0-9.,]+/.test(line)) || lines[0] || '';
                const code = ((text.match(/(?:Cod(?:igo)?|Ref|Fab)[:\s-]*([A-Za-z0-9./_-]+)/i) || [])[1] || '').trim();
                const stock = ((text.match(/(?:Estoque|Saldo|Disponivel|Qtd)[:\s-]*([0-9]+)/i) || [])[1] || '0').trim();
                const linkNode = node.querySelector('a[href]');

                return {
                    provider: providerName,
                    nome: product,
                    preco: price,
                    codigo: code,
                    estoque: stock,
                    link: linkNode ? linkNode.href : '',
                };
            }).filter(Boolean);
        };

        const cardResults = parseProductCards();
        if (cardResults.length) {
            return cardResults;
        }

        const tableResults = parseTableRows();
        return tableResults.length ? tableResults : fallbackCards();
    }, { providerName });
}

module.exports = {
    key: 'sky',
    matches: (supplierName) => supplierName.includes('sky'),
    authenticatedUrl: 'https://cliente.skypecas.com.br/',
    extraSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[placeholder*="e-mail" i]', 'input[placeholder*="email" i]', 'input[type="text"]'],
    passSelector: ['input[type="password"]'],
    loginSuccessSelector: [
        'button:has-text("Buscar")',
        'input[placeholder*="Descricao da Peca" i]',
        'input[placeholder*="Codigo da Peca" i]',
        'select',
    ],
    searchSelector: SEARCH_SELECTORS,
    searchButtonSelector: SEARCH_BUTTON_SELECTORS,
    performSearch: async ({ page, query, dismissTransientUi }) => {
        const searched = await runBranchSearch(page, query, dismissTransientUi);
        if (!searched) {
            throw new Error('Campo de busca visivel nao encontrado na Sky Pecas.');
        }
    },
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const visibleTextInputs = [];
        const textInputs = page.locator('input:not([type="hidden"]):not([type="password"])');
        const textCount = await textInputs.count();

        for (let index = 0; index < textCount; index += 1) {
            const current = textInputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);

            if (isVisible && isEnabled) {
                visibleTextInputs.push(current);
            }
        }

        const passwordField = page.locator('input[type="password"]').first();

        if (supplier.loginExtraValue && visibleTextInputs[0]) {
            await fillVisibleLocator(visibleTextInputs[0], supplier.loginExtraValue);
        }

        if (supplier.loginCredential && visibleTextInputs[1]) {
            await fillVisibleLocator(visibleTextInputs[1], supplier.loginCredential);
        } else if (supplier.loginCredential && visibleTextInputs[0] && !supplier.loginExtraValue) {
            await fillVisibleLocator(visibleTextInputs[0], supplier.loginCredential);
        }

        if (await passwordField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passwordField, supplier.password || '');
        }
    },
    extractItems: async ({ page, supplier, query, dismissTransientUi }) => {
        const branchSelect = await resolveBranchSelect(page);
        if (!branchSelect) {
            return extractBranchResults(page, supplier.name);
        }

        const selectedLabel = await getSelectedBranchLabel(branchSelect.locator);
        const orderedOptions = [
            ...branchSelect.options.filter((option) => option.label === selectedLabel),
            ...branchSelect.options.filter((option) => option.label !== selectedLabel),
        ];

        const providerName = supplier.name;
        const currentItems = await extractBranchResults(page, providerName);
        if (currentItems.length > 0) {
            return currentItems;
        }

        const results = [];
        const visited = new Set();
        if (selectedLabel) visited.add(selectedLabel);

        for (const option of orderedOptions) {
            const optionValue = String(option.value || '').trim();
            const optionLabel = String(option.label || '').trim();
            const dedupeKey = optionValue || optionLabel;
            if (!optionLabel || visited.has(dedupeKey)) continue;
            visited.add(dedupeKey);

            if (optionValue) {
                await branchSelect.locator.selectOption(optionValue).catch(() => {});
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                await page.waitForTimeout(1500);
                await dismissTransientUi();
                await runBranchSearch(page, query, dismissTransientUi);
            }

            const branchProviderName = supplier.name;
            const branchItems = await extractBranchResults(page, branchProviderName);
            results.push(...branchItems);
        }

        return results;
    },
};
