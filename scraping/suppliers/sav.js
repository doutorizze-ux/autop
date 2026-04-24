module.exports = {
    key: 'sav',
    matches: (supplierName) => supplierName.includes('furacao') || supplierName.includes('furação') || supplierName.includes('sav'),
    authenticatedUrl: 'https://vendas.furacao.com.br/vendas/sav/produtos',
    userSelector: ['#username', 'input[name*="user" i]'],
    passSelector: ['#password', 'input[type="password"]'],
    extraSelector: ['#f'],
    submitSelector: ['button.btn-primary', 'button[type="submit"]'],
    loginSuccessSelector: ['#gsearch', 'a:has-text("Produtos")', 'text=Produtos'],
    searchSelector: ['#gsearch', 'input[placeholder*="pesquisar" i]', 'input[type="search"]'],
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const textInputs = page.locator('input:not([type="hidden"]):not([type="password"])');
        const passwordField = page.locator('input[type="password"]').first();
        const textCount = await textInputs.count();

        for (let index = 0; index < textCount; index += 1) {
            const current = textInputs.nth(index);
            const isVisible = await current.isVisible().catch(() => false);
            if (!isVisible) {
                continue;
            }

            await fillVisibleLocator(current, supplier.loginCredential || supplier.loginExtraValue || '');
            break;
        }

        if (await passwordField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passwordField, supplier.password || '');
        }
    },
};
