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

        const desiredProfile = String(supplier.loginExtraValue || 'Cliente').trim().toLowerCase();
        const profileSelect = page.locator('#f, select').first();
        const profileVisible = await profileSelect.isVisible().catch(() => false);

        if (profileVisible) {
            const selectedValue = await profileSelect.evaluate((element, desired) => {
                const select = element;
                const options = Array.from(select.options || []);
                const normalize = (value) =>
                    String(value || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim()
                        .toLowerCase();

                const desiredText = normalize(desired);
                const targetOption =
                    options.find((option) => normalize(option.textContent).includes(desiredText))
                    || options.find((option) => normalize(option.value).includes(desiredText))
                    || options.find((option) => {
                        const label = normalize(option.textContent);
                        return label && !label.includes('selecione');
                    });

                if (!targetOption) {
                    return '';
                }

                select.value = targetOption.value;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('blur', { bubbles: true }));
                return targetOption.value;
            }, desiredProfile).catch(() => '');

            if (selectedValue) {
                await page.waitForTimeout(300);
            }
        }

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
