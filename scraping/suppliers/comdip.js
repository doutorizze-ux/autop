module.exports = {
    key: 'comdip',
    matches: (supplierName) => supplierName.includes('comdip'),
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]', '#Cnpj', '#Login'],
    passSelector: ['input[id="pass"]', 'input[type="password"]'],
    submitSelector: ['button:has-text("Entrar")', 'button:has-text("Login")', 'button.btn-success'],
    loginSuccessSelector: ['input[type="search"]', 'button:has-text("MENU DEPARTAMENTOS")', 'a:has-text("Meu histórico")'],
    searchSelector: ['input[type="search"]', 'input[placeholder*="nome" i]', 'input[placeholder*="marca" i]', '.search-input'],
    searchButtonSelector: ['button[type="submit"]', 'button .fa-search', '.fa-search', '.icon-search'],
    beforeLogin: async ({ dismissTransientUi, setCheckboxState }) => {
        await dismissTransientUi();
        await setCheckboxState(['input[type="checkbox"]'], true);
    },
};
