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
        'div.css-m8wze7',
        'div[class*="css-m8wze7"]',
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
    submitSelector: ['button:has-text("Entrar")', 'button[type="submit"]', 'input[type="submit"]'],
    navigateToAuthenticatedAfterLogin: true,
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const jaTenhoConta = page.locator('button:has-text("Já tenho conta"), button:has-text("Ja tenho conta")').first();
        if (await jaTenhoConta.isVisible({ timeout: 2000 }).catch(() => false)) {
            await jaTenhoConta.dispatchEvent('click').catch(() => jaTenhoConta.click({ force: true })).catch(() => {});
            await page.waitForTimeout(600);
        }

        const emailField = page.locator('input[placeholder*="Digite seu e-mail" i], input[type="email"]').first();
        const passField = page.locator('input[placeholder*="Digite sua senha" i], input[type="password"]').first();

        await emailField.fill(supplier.loginCredential || supplier.loginExtraValue || 'atendimento@centroautomotivo0058.com');
        await passField.fill(supplier.password || '71401');
    },
    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi, supplier }) => {
        await dismissTransientUi();

        // If logged out (not on /compras or login inputs present), auto-authenticate
        if (!page.url().includes('/compras') || page.url().includes('/login')) {
            const emailField = page.locator('input[placeholder*="Digite seu e-mail" i], input[type="email"]').first();
            const passField = page.locator('input[placeholder*="Digite sua senha" i], input[type="password"]').first();
            const submitBtn = page.locator('button:has-text("Entrar")').first();

            if (await emailField.isVisible({ timeout: 2500 }).catch(() => false)) {
                await emailField.fill(supplier?.loginCredential || supplier?.loginExtraValue || 'atendimento@centroautomotivo0058.com');
                await passField.fill(supplier?.password || '71401');
                await submitBtn.click().catch(() => {});
                await page.waitForURL((url) => url.href.includes('/compras'), { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(1500);
            }
        }

        try {
            const atualizar = page.locator('button:has-text("Atualizar")').first();
            if (await atualizar.isVisible({ timeout: 1500 }).catch(() => false)) {
                await atualizar.click().catch(() => {});
                await page.waitForTimeout(2000);
            }
        } catch (_) {}

        if (!page.url().includes('/compras')) {
            await page.goto('https://kki.autonorte.com.br/compras', { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(1500);
        }

        await page.waitForSelector('input:not([type="hidden"])', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);

        const searchInput = page.locator('input[placeholder*="Referência" i], input[placeholder*="refer" i], input[placeholder*="descr" i], input[placeholder*="codigo" i]').first();
        await searchInput.fill(query);

        const searchButton = page.locator('button:has-text("Pesquisar"), button:has-text("Buscar")').first();
        if (await searchButton.isVisible().catch(() => false)) {
            await searchButton.dispatchEvent('click').catch(() => searchButton.click({ force: true }));
        } else {
            await searchInput.press('Enter').catch(() => {});
        }

        await page.waitForTimeout(3000);
        await page.waitForFunction(() => {
            const body = String(document.body?.innerText || '');
            return Boolean(document.querySelector('div.css-m8wze7, div[class*="css-m8wze7"]'))
                || /distribuido por/i.test(body)
                || /Nenhum produto encontrado/i.test(body);
        }, { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await dismissTransientUi();
    },
    extractItems: async ({ page, supplier }) => {
        return page.evaluate((supplierName) => {
            const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const cards = Array.from(document.querySelectorAll('div.css-m8wze7, div[class*="css-m8wze7"]'));
            
            if (cards.length > 0) {
                return cards.map((card) => {
                    const lines = String(card.innerText || '').split('\n').map(clean).filter(Boolean);
                    if (lines.length < 3) return null;

                    const priceMatch = lines[0].match(/R\$\s*[0-9.,]+/);
                    if (!priceMatch) return null;

                    const hasAviseMe = lines.includes('Avise-me');
                    const nome = lines[1] || '';
                    const marca = hasAviseMe ? (lines[3] || '') : (lines[2] || '');
                    const codigo = hasAviseMe ? (lines[4] || '') : (lines[3] || '');
                    
                    const estoqueLine = lines.find(l => /Em estoque:/i.test(l)) || '';
                    const estoqueMatch = estoqueLine.match(/Em estoque:\s*([0-9]+)/i);
                    const estoque = estoqueMatch ? estoqueMatch[1] : (hasAviseMe ? '0' : '1');
                    
                    const distLine = lines.find(l => /Distribuído por/i.test(l)) || '';
                    const distMatch = distLine.match(/Distribuído por\s*:?\s*([^\n]+)/i);
                    const distributor = distMatch ? clean(distMatch[1]) : '';

                    return {
                        provider: supplierName,
                        nome: `${nome} ${marca} ${codigo}`.trim(),
                        preco: lines[0],
                        codigo,
                        marca,
                        aplicacao: '',
                        estoque,
                        estoqueTexto: `Em estoque: ${estoque}`,
                        link: window.location.href,
                    };
                }).filter(Boolean);
            }

            return [];
        }, supplier.name);
    },
};
