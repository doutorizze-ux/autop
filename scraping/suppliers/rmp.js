module.exports = {
    key: 'rmp',
    matches: (supplierName) => supplierName.includes('real moto') || supplierName.includes('rmp'),
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[type="email"]'],
    passSelector: ['input[type="password"]'],
    searchSelector: ['input[value="CAR80"]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]', 'input[placeholder*="descrição" i]', 'input[placeholder*="descricao" i]', 'input.busca'],
    searchButtonSelector: ['button:has(.fa-search)', 'button[type="submit"]'],
};
