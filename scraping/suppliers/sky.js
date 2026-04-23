module.exports = {
    key: 'sky',
    matches: (supplierName) => supplierName.includes('sky'),
    extraSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[placeholder*="e-mail" i]', 'input[placeholder*="email" i]', 'input[type="text"]'],
    passSelector: ['input[type="password"]'],
    searchSelector: ['input[placeholder*="descrição da peça" i]', 'input[placeholder*="descricao da peça" i]', 'input[placeholder*="código da peça" i]', 'input[placeholder*="codigo da peca" i]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]'],
    searchButtonSelector: ['button:has-text("Buscar")', 'button[type="submit"]'],
};
