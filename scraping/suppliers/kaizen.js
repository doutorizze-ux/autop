module.exports = {
    key: 'kaizen',
    matches: (supplierName) => supplierName.includes('kaizen'),
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]'],
    passSelector: ['input[type="password"]'],
    submitSelector: ['button:has-text("Entrar")', 'button[type="submit"]'],
    loginSuccessSelector: ['button:has-text("Busca por Código")', 'button:has-text("Busca por Veículo")', 'input[placeholder*="LB55" i]'],
    searchSelector: ['input[placeholder*="LB55" i]', 'input[placeholder*="W0120" i]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]', 'input[placeholder*="descrição" i]', 'input[placeholder*="descricao" i]'],
    searchButtonSelector: ['button:has(svg)', 'button:has(.fa-search)', 'button[type="submit"]'],
};
