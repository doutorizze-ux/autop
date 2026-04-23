module.exports = {
    key: 'sav',
    matches: (supplierName) => supplierName.includes('furacao') || supplierName.includes('furação') || supplierName.includes('sav'),
    userSelector: ['#username', 'input[name*="user" i]'],
    passSelector: ['#password', 'input[type="password"]'],
    extraSelector: ['#f'],
    submitSelector: ['button.btn-primary', 'button[type="submit"]'],
    searchSelector: ['#gsearch', 'input[placeholder*="pesquisar" i]', 'input[type="search"]'],
};
