module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'input[formcontrolname="descricao"]', 'button.btn-buscar'],
    searchSelector: ['input[formcontrolname="descricao"]', 'input[role="search"]', 'input[placeholder*="código ou descrição" i]'],
    searchButtonSelector: ['button.btn-buscar'],
    buildSearchUrl: (query) => {
        return `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
    },
    itemContainerSelector: ['mat-card', '.product-item', '.card-produto', 'tr.mat-row'],
    productNameSelector: ['.product-name', '.product-title', '.descricao-produto', 'td.mat-column-descricao'],
    priceSelector: ['.price', '.valor', '.preco', 'td.mat-column-preco']
};
