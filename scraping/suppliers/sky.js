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

async function waitForSearchRender(page) {
    await page.waitForFunction(() => {
        const bodyText = String(document.body?.innerText || '');
        const hasCards = document.querySelectorAll('#tb_produto .bx_produto').length > 0;
        const hasCounter = Boolean(document.querySelector('#tb_produto, .resultado_contador'));
        const hasEmptyMessage = /nenhum|nao encontrado|não encontrado/i.test(bodyText);
        const stillLoading = /carregando/i.test(bodyText);
        return hasCards || hasCounter || hasEmptyMessage || !stillLoading;
    }, null, { timeout: 12000 }).catch(() => {});

    await page.waitForTimeout(1200);
}

async function runBranchSearch(page, query, dismissTransientUi) {
    const input = await pickSearchInput(page, query);
    if (!input) {
        return false;
    }

    await page.locator('#inpPeca').fill('').catch(() => {});
    await page.locator('#inpCodigo').fill('').catch(() => {});
    await page.locator('#inpCodigoBarras').fill('').catch(() => {});
    await input.click({ force: true }).catch(() => {});
    await input.fill('').catch(() => {});
    await input.fill(String(query || '')).catch(() => {});
    await page.waitForTimeout(200);

    const clicked = await clickVisibleSearchButton(page);
    if (!clicked) {
        await input.press('Enter').catch(() => {});
    }

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await waitForSearchRender(page);
    await dismissTransientUi();
    return true;
}

async function resolveBranchSelect(page) {
    const selects = page.locator('select');
    const count = await selects.count().catch(() => 0);
    let fallback = null;

    for (let index = 0; index < count; index += 1) {
        const current = selects.nth(index);
        const isVisible = await current.isVisible().catch(() => false);
        const isEnabled = await current.isEnabled().catch(() => true);
        if (!isVisible || !isEnabled) continue;

        const options = await current.locator('option').evaluateAll((nodes) =>
            nodes.map((node) => ({
                value: String(node.value || '').trim(),
                label: String(node.textContent || '').trim(),
            }))
        ).catch(() => []);

        const meaningfulOptions = options.filter((option) => option.label);
        if (meaningfulOptions.length < 2) continue;

        const joined = normalizeLabel(meaningfulOptions.map((option) => option.label).join(' '));
        if (
            joined.includes('embrepar')
            || joined.includes('fortlub')
            || joined.includes('aeroviario')
            || joined.includes('perimetral')
        ) {
            return { locator: current, options: meaningfulOptions };
        }

        if (!fallback) {
            fallback = { locator: current, options: meaningfulOptions };
        }
    }

    return fallback;
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

        const parseProductCards = () => {
            const cards = Array.from(document.querySelectorAll('#tb_produto .bx_produto, .bx_produto'));
            return cards.map((card) => {
                const text = clean(card.textContent);
                const price = clean(card.querySelector('.valor .preco_final')?.textContent || '');
                if (!price) return null;

                const fabCode = clean(card.querySelector('.codfab strong')?.textContent || '');
                const nnCode = clean(card.querySelector('.codnn')?.textContent || '').replace(/^N\/N:\s*/i, '');
                const auxCode = clean(card.querySelector('.codaux')?.textContent || '').replace(/^C[oó]d\.\s*Aux:\s*/i, '');
                const stockText = clean(card.querySelector('.lkDisp')?.textContent || '');
                const stock = ((stockText.match(/([0-9]+)/) || [])[1] || '0').trim();
                const product = clean(card.querySelector('.nome')?.textContent || '');
                const brand = clean(card.querySelector('.fornecedor')?.textContent || '');
                const linkNode = card.querySelector('.lkAplicacao[href], .lkSimilar[href], a[href]');

                return {
                    provider: providerName,
                    nome: product || text,
                    preco: `R$ ${price}`,
                    codigo: fabCode || nnCode || auxCode,
                    marca: brand,
                    estoque: stock,
                    estoqueTexto: stockText,
                    link: linkNode ? linkNode.href : '',
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
            const nodes = Array.from(document.querySelectorAll('tr, article, .produto, .item, .card, .product-card'));
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

        const results = [];
        const visited = new Set();

        for (const option of orderedOptions) {
            const optionValue = String(option.value || '').trim();
            const optionLabel = String(option.label || '').trim();
            const dedupeKey = optionValue || optionLabel;
            if (!optionLabel || visited.has(dedupeKey)) continue;
            visited.add(dedupeKey);

            const isCurrent = optionLabel === selectedLabel || optionValue === '';
            if (!isCurrent && optionValue) {
                await branchSelect.locator.selectOption(optionValue).catch(() => {});
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                await page.waitForTimeout(1500);
                await dismissTransientUi();
                await runBranchSearch(page, query, dismissTransientUi);
            }

            const providerName = `${supplier.name} - ${optionLabel}`;
            const branchItems = await extractBranchResults(page, providerName);
            results.push(...branchItems);
        }

        return results;
    },
};
