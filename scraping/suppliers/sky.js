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
    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }

    const pageTitle = await page.title().catch(() => '');
    if (/522|520|524|502|504|Connection timed out|Cloudflare/i.test(pageTitle)) {
        throw new Error('Site da Sky Peças instável ou fora do ar (Cloudflare Timeout).');
    }

    try {
        const swalBtn = page.locator('button.swal2-confirm, button.swal2-close, .swal2-actions button, button:has-text("OK")').first();
        if (await swalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await swalBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
        }
    } catch (_) {}

    const inp = page.locator('#inpCodigo').first();
    const isVisible = await inp.isVisible({ timeout: 4000 }).catch(() => false);
    if (!isVisible) {
        const fallbackInp = await pickSearchInput(page, query);
        if (fallbackInp) {
            await fallbackInp.click({ force: true });
            await fallbackInp.fill(String(query || ''));
            await fallbackInp.dispatchEvent('input');
            await fallbackInp.dispatchEvent('change');
            await clickVisibleSearchButton(page);
            await page.waitForTimeout(2500);
            return true;
        }
        return false;
    }

    await inp.click({ force: true });
    await inp.fill(String(query || ''));
    await inp.dispatchEvent('input');
    await inp.dispatchEvent('change');

    const btn = page.locator('#btnBuscar').first();
    await btn.click({ force: true });
    await page.waitForTimeout(2500);

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

const SKY_BRANCHES = [
    { id: '222', name: 'FORTLUB (GOIÂNIA)' },
    { id: '411', name: 'Embrepar (GO - Perimetral)' },
    { id: '414', name: 'Embrepar (GO - Aeroviario)' },
];

async function searchAllSkyBranches(page, supplierName, query) {
    return page.evaluate(async ({ query, supplierName, branches }) => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const allItems = [];
        const csfr = (window.$ ? window.$('#csrf_token').val() : '') || '';

        for (const b of branches) {
            await new Promise((resolve) => {
                window.$.post('/site/troca_loja', { loja: b.id }, () => resolve(), 'json').fail(() => resolve());
            });
            await new Promise((r) => setTimeout(r, 350));

            const busca = await new Promise((resolve) => {
                window.$.post('/site/buscar', {
                    montadora: '0',
                    veiculo: '0',
                    marca: '0',
                    departamento: '0',
                    produto: '0',
                    modelo: '0',
                    motor: '0',
                    valvula: '0',
                    ano: '',
                    codigo: query,
                    peca: '',
                    codigo_barras: '',
                    codigos: '',
                    tipo_clique_busca_peca: 'clique',
                    csrf_token: csfr,
                    codigos_multiplos: [],
                }, (res) => resolve(res), 'json').fail(() => resolve({ fail: true }));
            });

            if (busca && busca.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = busca.html;
                const cards = Array.from(tempDiv.querySelectorAll('.bx_produto'));

                for (const card of cards) {
                    const rawText = String(card.innerText || '');
                    const cleanText = clean(rawText);
                    const priceMatch = rawText.match(/R\$\s*([0-9.,]+)/);
                    if (!priceMatch) continue;
                    const price = `R$ ${clean(priceMatch[1])}`;

                    const fabCodeMatch = rawText.match(/C[oó]d\.?\s*F[aá]b\.?:\s*([^\s\t\n]+)/i);
                    const nnCodeMatch = rawText.match(/N\/N:\s*([^\s\t\n]+)/i);
                    const codigo = (fabCodeMatch ? fabCodeMatch[1] : (nnCodeMatch ? nnCodeMatch[1] : '')) || '';

                    const isIndisponivel = /indisponivel|fora de estoque/i.test(rawText);
                    const stockMatch = rawText.match(/Estoque:\s*([0-9]+)/i);
                    const stockNum = stockMatch ? Number.parseInt(stockMatch[1], 10) : (isIndisponivel ? 0 : 1);
                    const stock = String(Number.isFinite(stockNum) ? stockNum : 0);

                    const lines = rawText.split('\n').map(clean).filter(Boolean);
                    const titleLine = lines[0] || '';
                    const parts = titleLine.split('-');
                    const nome = clean(card.querySelector('.nome')?.innerText || parts[0] || titleLine);
                    const marca = clean(card.querySelector('.fornecedor')?.innerText || parts[1] || (lines.find((l) => /MANN|WEGA|FRAM|TECFIL|FRAS-LE|NAKATA|COBREQ/i.test(l)) || ''));

                    const linkNode = card.querySelector('a[href]');

                    const stockText = Number(stock) > 0
                        ? `Estoque: ${stock} (${b.name})`
                        : `Consulte filial (${b.name})`;

                    allItems.push({
                        provider: supplierName,
                        branch: b.name,
                        nome: `${nome} ${marca} ${codigo}`.trim(),
                        preco: price,
                        codigo,
                        marca,
                        estoque: stock,
                        estoqueTexto: stockText,
                        available: true,
                        link: linkNode ? linkNode.href : window.location.href,
                    });
                }
            }
        }

        // Ordena itens: com estoque > 0 primeiro
        allItems.sort((a, b) => Number(b.estoque || 0) - Number(a.estoque || 0));
        return allItems;
    }, { query, supplierName, branches: SKY_BRANCHES });
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
    performSearch: async ({ page, query, supplier, dismissTransientUi }) => {
        const title = await page.title().catch(() => '');
        if (/522|520|524|502|504|Connection timed out|Cloudflare/i.test(title)) {
            throw new Error('Site da Sky Peças instável no momento (servidor do fornecedor com timeout).');
        }
        if (title.toLowerCase().includes('login') || page.url().endsWith('/login')) {
            console.log('[sky] Detected login page, executing auto-login...');
            await page.goto('https://cliente.skypecas.com.br/', { waitUntil: 'domcontentloaded' }).catch(() => {});
            const cnpjLoc = page.locator('#txtCNPJCPF, input[name="cnpj"]').first();
            const userLoc = page.locator('input[name="login"]').first();
            const passLoc = page.locator('input[name="senha"]').first();
            const submitBtn = page.locator('#btnEntrar, input[type="submit"]').first();

            const cnpj = supplier?.loginExtraValue || '33.299.637/0001-80';
            const user = supplier?.loginCredential || 'renan0058';
            const pass = supplier?.password || 'rE539597@';

            if (await cnpjLoc.isVisible({ timeout: 3000 }).catch(() => false)) {
                await cnpjLoc.fill(cnpj);
                await userLoc.fill(user);
                await passLoc.fill(pass);
                await submitBtn.click().catch(() => {});
                await page.waitForTimeout(4000);
            }
            await page.goto('https://cliente.skypecas.com.br/produtos', { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(1500);
        }

        // Não precisa clicar no botão da tela pois extractItems faz busca direta nas 3 lojas
        if (typeof dismissTransientUi === 'function') {
            await dismissTransientUi().catch(() => {});
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
    extractItems: async ({ page, supplier, query }) => {
        const items = await searchAllSkyBranches(page, supplier.name, query);
        if (items && items.length > 0) {
            return items;
        }
        return extractBranchResults(page, supplier.name);
    },
};
