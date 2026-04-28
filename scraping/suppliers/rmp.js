module.exports = {
    key: 'rmp',
    matches: (supplierName) => supplierName.includes('real moto') || supplierName.includes('rmp'),
    userSelector: ['input[name*="user" i]', 'input[name*="login" i]', 'input[type="email"]'],
    passSelector: ['input[type="password"]'],
    loginSuccessSelector: ['.header-search', '.welcome-msg', 'a[href*="logout"]', 'input[placeholder*="descrição" i]', 'input[placeholder*="descricao" i]', 'input[placeholder*="marca" i]', 'input[placeholder*="veículo" i]', '.authorization-link'],
    searchSelector: ['input[value="CAR80"]', 'input[placeholder*="código" i]', 'input[placeholder*="codigo" i]', 'input[placeholder*="descrição" i]', 'input[placeholder*="descricao" i]', 'input.busca'],
    searchButtonSelector: ['button:has(.fa-search)', 'button[type="submit"]'],
    buildSearchUrl: (query) => {
        const value = String(query).trim();
        const looksLikeCode = /^[A-Za-z0-9-]{3,}$/.test(value) && !/\s/.test(value);
        const codeParam = looksLikeCode ? `&code=${encodeURIComponent(value)}` : '';
        return `https://loja.rmp.com.br/catalogsearch/result/?q=${encodeURIComponent(value)}${codeParam}`;
    },
};
