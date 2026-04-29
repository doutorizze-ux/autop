
const dpkStrategy = {
    name: 'dpk',
    matches: (name) => name.toLowerCase().includes('dpk'),
    url: 'https://dpk.com.br/',
    searchSelector: ['input[formcontrolname="descricao"]', 'input[role="search"]'],
    searchButtonSelector: ['button.btn-buscar', '.btn-buscar'],
    buildSearchUrl: (query) => {
        return `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
    },
    needsLogin: false,

    performSearch: async ({ page, query }) => {
        const proxyKey = process.env.SCRAPERAPI_KEY;
        // URL da DPK
        const targetUrl = `https://dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
        
        console.error(`[FORCE_V2] Iniciando busca DPK para: ${query}`);
        
        if (proxyKey) {
            const tunnelUrl = `http://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=br`;
            console.error(`[FORCE_V2] Usando Túnel ScraperAPI: ${tunnelUrl.substring(0, 50)}...`);
            await page.goto(tunnelUrl, { waitUntil: 'networkidle', timeout: 90000 }).catch(e => {
                console.error(`[FORCE_V2] Erro no Túnel: ${e.message}`);
            });
        } else {
            console.error(`[FORCE_V2] ALERTA: SCRAPERAPI_KEY não configurada! Tentando direto.`);
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        }

        await page.waitForTimeout(8000);
    },

    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const items = [];
            document.querySelectorAll('mat-card, .card-produto, .product-item').forEach(el => {
                const name = el.querySelector('.titulo-produto, h3, .name')?.innerText?.trim();
                const priceStr = el.querySelector('.preco-venda, .price, .valor')?.innerText?.trim();
                const code = el.querySelector('.codigo-produto, .code')?.innerText?.trim();
                
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
