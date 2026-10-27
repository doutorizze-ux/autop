const { safeString } = require('./shared');

const PORTAL_URL = 'https://rolemarmaster.com/';

function formatBrl(value) {
    const amount = Number(value || 0);
    if (!(amount > 0)) {
        return '';
    }

    return `R$ ${amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

module.exports = {
    key: 'rolemar',
    matches: (supplierName) =>
        supplierName.includes('rolemar') ||
        supplierName.includes('rolemarmaster'),
    authenticatedUrl: PORTAL_URL,
    navigateToAuthenticatedAfterLogin: false,
    userSelector: [
        'input#usuario',
        'input[name="usuario"]',
        'input[placeholder*="usuário" i]',
        'input[placeholder*="usuario" i]',
        'input[placeholder*="cnpj" i]',
        'input[type="text"]',
    ],
    passSelector: [
        'input#senha',
        'input[name="senha"]',
        'input[type="password"]',
        'input[placeholder*="senha" i]',
    ],
    submitSelector: [
        'button:has-text("Entrar")',
        'button[type="submit"]',
        'button.ant-btn-primary',
    ],
    loginSuccessSelector: [
        'input[placeholder*="PESQUISE" i]',
        '.user-menu-trigger',
        '.filial-dropdown-trigger',
        '#header-form-search',
    ],
    searchSelector: [
        '#header-form-search input',
        'input[placeholder*="PESQUISE" i]',
    ],
    itemContainerSelector: ['.product-info', '.ant-spin-container'],
    emptyResultSelector: [
        '.ant-empty',
        ':has-text("Nenhum produto encontrado")',
    ],
    preferStrategySelectors: true,

    buildSearchUrl: (query) => `https://rolemarmaster.com/produtos?busca=${encodeURIComponent(query)}`,
    performSearch: async ({ page, query }) => {
        const searchUrl = `https://rolemarmaster.com/produtos?busca=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(2500);
        await Promise.race([
            page.locator('.product-info').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null),
            page.locator('.ant-empty, :has-text("Nenhum produto")').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null),
        ]);
        await page.waitForTimeout(1000);
    },

    extractItems: async ({ page, supplier, query }) => {
        const items = await page.evaluate(() => {
            const containers = document.querySelectorAll('.product-info');
            const results = [];

            for (const c of containers) {
                const codeEl = c.querySelector('.product-code-text');
                const titleEl = c.querySelector('.product-title');
                const appEl = c.querySelector('.product-aplication');
                const finalPriceEl = c.querySelector('.final-price p') || c.querySelector('.price p');

                const parent = c.closest('.ant-spin-container') || c.parentElement;
                const inputQtd = parent ? parent.querySelector('#qtd-inpt') : null;
                const addBtn = parent ? parent.querySelector('.add-to-cart-btn') : null;

                let stock = 0;
                if (inputQtd && inputQtd.getAttribute('max')) {
                    stock = parseInt(inputQtd.getAttribute('max'), 10) || 0;
                } else if (addBtn && !addBtn.disabled) {
                    stock = 1;
                }

                const rawCode = (codeEl?.innerText || '').trim();
                const parts = rawCode.split('|').map((s) => s.trim());
                const codigo = parts[0] || '';
                const marca = parts[1] || '';
                const nome = (titleEl?.innerText || '').trim();
                const aplicacao = (appEl?.innerText || '').trim();
                const priceText = (finalPriceEl?.innerText || '').trim();

                if (nome && priceText) {
                    results.push({
                        codigo,
                        marca,
                        nome,
                        aplicacao,
                        preco: priceText,
                        estoque: stock,
                        estoqueTexto: stock > 0 ? `${stock} em estoque` : 'Indisponível',
                        link: window.location.href,
                    });
                }
            }
            return results;
        });

        const mapped = items.map((item) => ({
            provider: supplier.name,
            nome: item.nome,
            preco: item.preco,
            codigo: item.codigo,
            marca: item.marca,
            aplicacao: item.aplicacao,
            estoque: item.estoque,
            estoqueTexto: item.estoqueTexto,
            link: item.link || PORTAL_URL,
        })).filter((item) => safeString(item.nome) && safeString(item.preco));

        if (query && mapped.length > 0) {
            const cleanQ = String(query).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            // Sort exact code matches to the top
            mapped.sort((a, b) => {
                const aCode = String(a.codigo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                const bCode = String(b.codigo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                const aExact = aCode === cleanQ;
                const bExact = bCode === cleanQ;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                const aMatch = aCode.includes(cleanQ) || cleanQ.includes(aCode);
                const bMatch = bCode.includes(cleanQ) || cleanQ.includes(bCode);
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }

        return mapped;
    },
    baseUrl: PORTAL_URL,
};
