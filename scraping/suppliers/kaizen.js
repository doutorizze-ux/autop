module.exports = {
    key: 'kaizen',
    matches: (supplierName) => supplierName.includes('kaizen'),
    authenticatedUrl: 'https://portal.kaizenautopecas.com.br/principal',
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    passSelector: ['input[type="password"]'],
    submitSelector: ['button:has-text("Entrar")', 'button[type="submit"]'],
    loginSuccessSelector: ['button:has-text("Busca por Código")', 'button:has-text("Busca por Veículo")', 'input[placeholder*="LB55" i]'],
    searchSelector: ['input[placeholder*="LB55" i]', 'input[placeholder*="W0120" i]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]', 'input[placeholder*="descrição" i]', 'input[placeholder*="descricao" i]'],
    searchButtonSelector: ['button:has(svg)', 'button:has(.fa-search)', 'button[type="submit"]'],
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

        const loginValue = String(supplier.loginCredential || '').replace(/\D/g, '') || String(supplier.loginCredential || '');

        if (firstVisibleTextInput) {
            await fillVisibleLocator(firstVisibleTextInput, loginValue);
        }

        if (passwordField && await passwordField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passwordField, supplier.password || '');
        }
    },
};
