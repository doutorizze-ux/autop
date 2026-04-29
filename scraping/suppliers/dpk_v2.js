
const dpkStrategy = {
    name: 'dpk',
    matches: (name) => name.toLowerCase().includes('dpk'),
    url: 'https://dpk.com.br/',
    searchSelector: ['mat-card', '.card-produto', '.product-item'],
    searchButtonSelector: ['button.btn-buscar', '.btn-buscar'],
    buildSearchUrl: (query) => {
        return `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
    },
    needsLogin: false,

    performSearch: async ({ page, query }) => {
        // CHAVE GRAVADA DIRETAMENTE PARA EVITAR ERRO DE CONFIGURAÇÃO NO COOLIFY
        const proxyKey = '753cc8adb1fb57a3b9fa1529cd381197';
        const targetUrl = `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
        
        console.error(`[FORCE_V2] Iniciando busca DPK via TÚNEL DIRETO para: ${query}`);
        
        const tunnelUrl = `http://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=br`;
        
        await page.goto(tunnelUrl, { waitUntil: 'networkidle', timeout: 120000 }).catch(e => {
            console.error(`[FORCE_V2] Erro Fatal no Túnel: ${e.message}`);
        });

        // Espera o Angular renderizar os produtos
        await page.waitForTimeout(10000);
    },

    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const items = [];
            document.querySelectorAll('mat-card, .card-produto, .product-item, .grid-produto').forEach(el => {
                const name = el.querySelector('.titulo-produto, h3, .name, .desc-produto')?.innerText?.trim();
                const priceStr = el.querySelector('.preco-venda, .price, .valor, .price-value')?.innerText?.trim();
                const code = el.querySelector('.codigo-produto, .code, .ref-produto')?.innerText?.trim();
                
                if (name) {
                    items.push({
                        name,
                        price: priceStr ? parseFloat(priceStr.replace(/[^\d,]/g, '').replace(',', '.')) : 0.01,
                        code: code || '',
                        brand: 'DPK',
                        stock: 1
                    });
                }
            });
            return items;
        });
    }
};

module.exports = dpkStrategy;
