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
    itemContainerSelector: ['tr'],
    productNameSelector: ['td'],
    priceSelector: ['td'],
    availableSelector: ['td'],
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
        const searchButton = searchForm.locator('#btnBusca, button[name="btnSub"]').first();

        if (await codeField.isVisible().catch(() => false)) {
            await fillVisibleLocator(codeField, query);
        }

        if (await barcodeField.isVisible().catch(() => false)) {
            await barcodeField.fill('').catch(() => {});
        }

        if (await searchButton.isVisible().catch(() => false)) {
            await searchButton.click({ force: true }).catch(() => {});
        } else if (await codeField.isVisible().catch(() => false)) {
            await codeField.press('Enter').catch(() => {});
        }
    },
};
