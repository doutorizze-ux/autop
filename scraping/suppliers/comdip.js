module.exports = {
    key: 'comdip',
    matches: (supplierName) => supplierName.includes('comdip'),
    authenticatedUrl: 'https://portalcomdip.com.br/comdip/compras',
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]', '#Cnpj', '#Login'],
    passSelector: ['input[id="pass"]', 'input[type="password"]'],
    submitSelector: ['button:has-text("Entrar")', 'button:has-text("Login")', 'button.btn-success'],
    loginSuccessSelector: ['a:has-text("Meu histÃ³rico")', 'a:has-text("Minhas Listas")', 'text=OFICINA DO'],
    searchSelector: ['input[type="search"]', 'input[placeholder*="nome" i]', 'input[placeholder*="marca" i]', '.search-input'],
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

        const forms = page.locator('form');
        const formCount = await forms.count().catch(() => 0);
        let loginScope = page;

        for (let index = 0; index < formCount; index += 1) {
            const currentForm = forms.nth(index);
            const hasPassword = await currentForm.locator('input[type="password"]').count().catch(() => 0);
            const isVisible = await currentForm.isVisible().catch(() => false);

            if (hasPassword && isVisible) {
                loginScope = currentForm;
                break;
            }
        }

        const textInputs = loginScope.locator('input:not([type="hidden"]):not([type="password"])');
        const textCount = await textInputs.count().catch(() => 0);
        let firstVisibleTextInput = null;

        for (let index = 0; index < textCount; index += 1) {
            const current = textInputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);

            if (isVisible && isEnabled) {
                firstVisibleTextInput = current;
                break;
            }
        }

        const passwordInputs = loginScope.locator('input[type="password"]');
        const passwordCount = await passwordInputs.count().catch(() => 0);
        let passwordField = null;

        for (let index = 0; index < passwordCount; index += 1) {
            const current = passwordInputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);

            if (isVisible && isEnabled) {
                passwordField = current;
                break;
            }
        }

        const loginValue = String(supplier.loginCredential || '').trim();

        if (firstVisibleTextInput) {
            await fillVisibleLocator(firstVisibleTextInput, loginValue);
        }

        if (passwordField && await passwordField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passwordField, supplier.password || '');
        }
    },
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('[class*="produto"], [class*="item"], [class*="card"], article, li')).slice(0, 300);
            const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const seen = new Set();
            const items = [];

            for (const el of candidates) {
                const text = normalize(el.textContent || '');
                const priceMatch = text.match(/R\$\s?[0-9.,]+/);
                if (!priceMatch) continue;

                const rawNameCandidates = Array.from(el.querySelectorAll('h1, h2, h3, h4, h5, a, strong, span'))
                    .map((node) => normalize(node.textContent || ''))
                    .filter(Boolean);

                const nome =
                    rawNameCandidates.find((value) => /[A-Za-z]/.test(value) && !/^R\$\s?[0-9.,]+$/.test(value) && value.length > 6)
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

            return items.slice(0, 24);
        });
    },
    beforeLogin: async ({ page, dismissTransientUi, setCheckboxState }) => {
        await dismissTransientUi();

        const checkboxes = page.locator('input[type="checkbox"]');
        const count = await checkboxes.count().catch(() => 0);

        for (let index = 0; index < count; index += 1) {
            const current = checkboxes.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);
            const isChecked = await current.isChecked().catch(() => false);

            if (isVisible && isEnabled && !isChecked) {
                await current.click({ force: true }).catch(() => {});
            }
        }

        await setCheckboxState(['input[type="checkbox"]'], true);
    },
};
