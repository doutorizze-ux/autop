module.exports = {
    key: 'sky',
    matches: (supplierName) => supplierName.includes('sky'),
    authenticatedUrl: 'https://cliente.skypecas.com.br/',
    extraSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[placeholder*="e-mail" i]', 'input[placeholder*="email" i]', 'input[type="text"]'],
    passSelector: ['input[type="password"]'],
    loginSuccessSelector: [
        '#frmBusca',
        '#inpCodigo',
        '#btnBusca',
        'button:has-text("Buscar")',
        'input[placeholder*="CÃ³digo da PeÃ§a" i]',
        'input[placeholder*="Codigo da Peca" i]',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    searchSelector: ['#inpCodigo', 'input[name="codigo"]'],
    searchButtonSelector: ['#btnBusca', 'button[name="btnSub"]'],
    itemContainerSelector: ['#tb_produto .bx_produto', '.bx_produto'],
    productNameSelector: ['.nome'],
    priceSelector: ['.preco_final'],
    availableSelector: ['.lkEstoqueProduto'],
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

        const visibleTextInputs = [];
        const textInputs = loginScope.locator('input:not([type="hidden"]):not([type="password"])');
        const textCount = await textInputs.count().catch(() => 0);

        for (let index = 0; index < textCount; index += 1) {
            const current = textInputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            const isEnabled = await current.isEnabled().catch(() => true);

            if (isVisible && isEnabled) {
                visibleTextInputs.push(current);
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

        const extraValue = String(supplier.loginExtraValue || '').trim();

        if (supplier.loginExtraValue && visibleTextInputs[0]) {
            await fillVisibleLocator(visibleTextInputs[0], extraValue);
        }

        if (supplier.loginCredential && visibleTextInputs[1]) {
            await fillVisibleLocator(visibleTextInputs[1], supplier.loginCredential);
        } else if (supplier.loginCredential && visibleTextInputs[0] && !supplier.loginExtraValue) {
            await fillVisibleLocator(visibleTextInputs[0], supplier.loginCredential);
        }

        if (passwordField && await passwordField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passwordField, supplier.password || '');
        }
    },
    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const searchForm = page.locator('#frmBusca').first();
        const codeField = searchForm.locator('#inpCodigo, input[name="codigo"]').first();
        const barcodeField = searchForm.locator('#inpCodigoBarras, input[name="codigo_barras"]').first();
        const descriptionField = searchForm.locator('input[placeholder*="Descri" i]').first();
        const searchButton = searchForm.locator('#btnBusca, button[name="btnSub"]').first();

        if (await codeField.isVisible().catch(() => false)) {
            await fillVisibleLocator(codeField, query);
        }

        if (await descriptionField.isVisible().catch(() => false)) {
            await descriptionField.fill('').catch(() => {});
        }

        if (await barcodeField.isVisible().catch(() => false)) {
            await barcodeField.fill('').catch(() => {});
        }

        const responsePromise = page
            .waitForResponse(
                (response) =>
                    response.url().includes('/site/buscar') &&
                    response.request().method() === 'POST',
                { timeout: 15000 }
            )
            .catch(() => null);

        if (await searchButton.isVisible().catch(() => false)) {
            await searchButton.click({ force: true }).catch(() => {});
        } else if (await codeField.isVisible().catch(() => false)) {
            await codeField.press('Enter').catch(() => {});
        }

        const response = await responsePromise;
        if (response) {
            await response.json().catch(() => null);
        }

        await page
            .waitForSelector('#tb_produto .bx_produto, .bx_produto', { timeout: 15000 })
            .catch(() => {});
        await page.waitForTimeout(800).catch(() => {});
    },
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#tb_produto .bx_produto, .bx_produto'));

            return cards
                .map((card) => {
                    const name = card.querySelector('.nome')?.textContent?.trim() || '';
                    const price = card.querySelector('.preco_final')?.textContent?.trim() || '';
                    const code = card.querySelector('.codfab strong')?.textContent?.trim() || '';
                    const brand = card.querySelector('.fornecedor')?.textContent?.trim() || '';
                    const stockText = card.querySelector('.lkEstoqueProduto')?.textContent?.trim() || '';
                    const stockMatch = stockText.match(/\d+/);
                    const link =
                        card.querySelector('.lkAplicacao')?.getAttribute('href') ||
                        card.querySelector('.lkAdicionar')?.getAttribute('href') ||
                        card.querySelector('a[href]')?.getAttribute('href') ||
                        '';

                    return {
                        nome: name,
                        preco: price ? `R$ ${price}` : '',
                        codigo: code,
                        marca: brand,
                        estoque: stockMatch ? stockMatch[0] : '',
                        link,
                    };
                })
                .filter((item) => item.nome && item.preco);
        });
    },
};
