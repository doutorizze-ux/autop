module.exports = {
    key: 'sky',
    matches: (supplierName) => supplierName.includes('sky'),
    extraSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[placeholder*="e-mail" i]', 'input[placeholder*="email" i]', 'input[type="text"]'],
    passSelector: ['input[type="password"]'],
    loginSuccessSelector: [
        'button:has-text("Buscar")',
        'input[placeholder*="Descrição da Peça" i]',
        'input[placeholder*="Descricao da Peca" i]',
        'select',
    ],
    searchSelector: ['input[placeholder*="descrição da peça" i]', 'input[placeholder*="descricao da peça" i]', 'input[placeholder*="código da peça" i]', 'input[placeholder*="codigo da peca" i]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]'],
    searchButtonSelector: ['button:has-text("Buscar")', 'button[type="submit"]'],
    fillLogin: async ({ supplier, getVisibleLocators, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const textInputs = await getVisibleLocators([
            supplier.loginExtraSelector,
            supplier.loginUserSelector,
            'input:not([type="hidden"]):not([type="password"])',
        ]);
        const passwordInputs = await getVisibleLocators([supplier.loginPassSelector, 'input[type="password"]']);

        if (supplier.loginExtraValue && textInputs[0]) {
            await fillVisibleLocator(textInputs[0], supplier.loginExtraValue);
        }

        if (supplier.loginCredential && textInputs[1]) {
            await fillVisibleLocator(textInputs[1], supplier.loginCredential);
        } else if (supplier.loginCredential && textInputs[0] && !supplier.loginExtraValue) {
            await fillVisibleLocator(textInputs[0], supplier.loginCredential);
        }

        if (passwordInputs[0]) {
            await fillVisibleLocator(passwordInputs[0], supplier.password || '');
        }
    },
};
