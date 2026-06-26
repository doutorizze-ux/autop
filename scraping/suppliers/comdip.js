module.exports = {
    key: 'comdip',
    matches: (supplierName) => supplierName.includes('comdip'),
    authenticatedUrl: 'https://portalcomdip.com.br/comdip/compras',
    userSelector: [
        'input[placeholder*="cnpj/cpf" i]',
        'input[id^="mat-input-0"]',
        'input[name*="cnpj" i]',
        'input[placeholder*="cnpj" i]',
        'input[placeholder*="email" i]',
        'input[type="email"]',
        '#Cnpj',
        '#Login',
    ],
    passSelector: [
        'input[placeholder*="senha" i]',
        'input[id^="mat-input-1"]',
        'input[id="pass"]',
        'input[type="password"]',
    ],
    submitSelector: ['button:has-text("Entrar")', 'button:has-text("Login")', 'button.btn-success', 'button[type="submit"]'],
    loginSuccessSelector: [
        'body:has-text("Sair")',
        'body:has-text("OFICINA DO")',
        'a:has-text("Sair")',
        'a:has-text("Meu Histórico")',
        'a:has-text("Minhas Listas")',
        'text=OFICINA DO',
        'input[type="search"]',
        'input[placeholder*="buscar" i]',
    ],
    searchSelector: [
        'input[type="search"]',
        'input[placeholder*="nome" i]',
        'input[placeholder*="marca" i]',
        'input[placeholder*="buscar" i]',
        '.search-input',
    ],
    searchButtonSelector: ['button[type="submit"]', 'button .fa-search', '.fa-search', '.icon-search'],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    emptyResultSelector: ['text=0 itens encontrados', 'text=Nenhum resultado'],
    itemContainerSelector: ['[class*="produto"]', '[class*="item"]', '[class*="card"]', 'article', 'li'],
    productNameSelector: ['h2', 'h3', 'h4', 'a', 'strong', 'span'],
    priceSelector: ['.price', '.valor', '[class*="price"]', '[class*="valor"]'],
    buildSearchUrl: (query) => `https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/${encodeURIComponent(String(query).toLowerCase())}/1`,
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const consentSelectors = [
            'input[name="cbAceitarTermos"]',
            '#mat-slide-toggle-1-input',
            'input[type="checkbox"]',
        ];

        for (const selector of consentSelectors) {
            const locator = page.locator(selector).first();
            if (await locator.isVisible().catch(() => false)) {
                const checked = await locator.isChecked().catch(() => null);
                if (checked === false) {
                    await locator.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(300);
                }
            }
        }

        const emailField = page.locator(
            'input[placeholder*="cnpj/cpf" i], input[id^="mat-input-0"], input[name*="cnpj" i], input[type="email"], input[placeholder*="email" i]'
        ).first();
        const passField = page.locator(
            'input[placeholder*="senha" i], input[type="password"], input[id^="mat-input-1"]'
        ).first();

        if (await emailField.isVisible().catch(() => false)) {
            await fillVisibleLocator(emailField, supplier.loginCredential || supplier.loginExtraValue || '');
        }

        if (await passField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passField, supplier.password || '');
        }
    },
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('[class*="produto"], [class*="item"], [class*="card"], article, li, tr')).slice(0, 400);
            const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const seen = new Set();
            const items = [];

            for (const el of candidates) {
                const text = normalize(el.textContent || '');
                const priceMatch = text.match(/R\$\s?[0-9.,]+/);
                if (!priceMatch) continue;

                const rawNameCandidates = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, a, strong, span, div'))
                    .map((node) => normalize(node.textContent || ''))
                    .filter(Boolean);

                const nome =
                    rawNameCandidates.find((value) => /[A-Za-z]/.test(value) && !/^R\$\s?[0-9.,]+$/.test(value) && value.length > 4)
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

            return items.slice(0, 30);
        });
    },
    beforeLogin: async ({ page, dismissTransientUi }) => {
        await dismissTransientUi();
        for (const selector of ['input[name="cbAceitarTermos"]', '#mat-slide-toggle-1-input', 'input[type="checkbox"]']) {
            const locator = page.locator(selector).first();
            if (await locator.isVisible().catch(() => false)) {
                const checked = await locator.isChecked().catch(() => null);
                if (checked === false) {
                    await locator.click({ force: true }).catch(() => {});
                }
            }
        }
    },
};
