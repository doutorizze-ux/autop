module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'button.btn-buscar', 'input[formcontrolname="descricao"]'],
    searchSelector: ['input[formcontrolname="descricao"]', 'input[role="search"]', 'input[placeholder*="código ou descrição" i]'],
    searchButtonSelector: ['button.btn-buscar', 'button:has-text("Buscar")', '.btn-buscar'],
    buildSearchUrl: (query) => {
        return `https://www.dpk.com.br/busca-produto?termo=${encodeURIComponent(query)}`;
    },

    performSearch: async ({ page, query }) => {
        // Atraso aleatório para enganar o CloudFront
        await page.waitForTimeout(Math.floor(Math.random() * 3000) + 1000);
        
        const targetHash = `#/busca-produto?termo=${encodeURIComponent(query)}`;

        const fullUrl = `https://www.dpk.com.br/${targetHash}`;
        
        await page.goto(fullUrl, { waitUntil: 'networkidle' }).catch(() => {});
        
        // Em SPAs com hash, às vezes o goto não dispara se já estamos na página. 
        // Forçamos a mudança se necessário via evaluate.
        await page.evaluate((hash) => {
            if (window.location.hash !== hash) {
                window.location.hash = hash;
            }
        }, targetHash);

        // Espera crucial para o Angular/SPA processar a rota e os resultados
        await page.waitForTimeout(3000);
    },


    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('mat-card, .product-item, .card-produto, .grid-produto');
            cards.forEach(card => {
                const text = card.innerText || '';
                const nameNode = card.querySelector('.product-name, .product-title, .descricao-produto, a[href*="#/produtos/"]');
                const name = nameNode ? nameNode.innerText.trim() : '';
                
                // Se não tem nome mas tem o card, tenta pegar o texto principal
                if (!name && text.length > 10) return; 

                const priceBtn = card.querySelector('button:has-text("Ver preço"), .price, .preco, .valor');
                const priceText = priceBtn ? priceBtn.innerText : '0';
                
                // Extração de códigos
                const codeMatch = text.match(/Cód de Fábrica:\s*([A-Z0-9.-]+)/i) || text.match(/Cód\. de Fábrica:\s*([A-Z0-9.-]+)/i);
                const skuMatch = text.match(/Cód\. do Produto:\s*([0-9]+)/i) || text.match(/SKU:\s*([0-9]+)/i);
                
                const brandMatch = text.match(/Fabricante:\s*([^\n]+)/i);

                items.push({
                    nome: name || text.split('\n')[0],
                    preco: priceText.includes('Ver preço') ? 'R$ 0,01' : priceText, // Placeholder se não logado
                    codigo: codeMatch ? codeMatch[1] : (skuMatch ? skuMatch[1] : ''),
                    marca: brandMatch ? brandMatch[1].trim() : '',
                    estoque: '1',
                    link: window.location.href
                });
            });
            return items;
        });
    },
    itemContainerSelector: ['mat-card', '.product-item', '.card-produto', 'tr.mat-row', '.grid-produto', '.lista-produtos .item'],
    productNameSelector: ['.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]', 'td.mat-column-descricao'],
    priceSelector: ['.price', '.valor', '.preco', 'button:has-text("Ver preço")', 'td.mat-column-preco'],
    codeSelector: ['.codigo-produto', '.ref', '.sku', 'span:has-text("Cód de Fábrica:") + span'],
    waitForResultsOnly: true,
    emptyResultSelector: ['text="Não encontramos resultados"', '.sem-resultados', 'text="0 resultados"', 'text="Pesquisa por:"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true
};



