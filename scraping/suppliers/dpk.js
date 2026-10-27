const fs = require('fs');
const path = require('path');

let cachedBootstrapState = null;

function normalizeAscii(value) {
    return String(value || '')
        .replace(/\0/g, '')
        .replace(/[^\x20-\x7E]/g, ' ');
}

module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="userPrincipalName"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: [
        'text="Depósito"',
        'text="Meus pedidos"',
        'a[href*="logout"]',
        'button:has-text("Sair")',
        '.user-info'
    ],
    searchSelector: [
        'input[formcontrolname="searchTerm"]',
        'input[placeholder*="código ou descrição" i]',
        'input[placeholder*="codigo ou descricao" i]',
        'input[formcontrolname="descricao"]',
        'input[role="search"]',
    ],
    searchButtonSelector: ['button:has-text("Buscar")', 'button.btn-buscar', '.btn-buscar'],
    buildSearchUrl: (query) => `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`,
    preferProfileOverSessionData: false,
    preparePage: async ({ page, sessionData }) => {
        // If sessionData has localStorage tokens, inject them
        if (sessionData && sessionData.localStorage) {
            await page.addInitScript((ls) => {
                for (const [k, v] of Object.entries(ls)) {
                    try { localStorage.setItem(k, v); } catch (_) {}
                }
            }, sessionData.localStorage).catch(() => {});
        }
        try {
            const cookieBtn = page.locator('button:has-text("ENTENDI E FECHAR"), button:has-text("Entendi e fechar")').first();
            if (await cookieBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                await cookieBtn.click().catch(() => {});
            }
        } catch (_) {}
    },
    performSearch: async ({ page, query }) => {
        try {
            const cookieBtn = page.locator('button:has-text("ENTENDI E FECHAR"), button:has-text("Entendi e fechar")').first();
            if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await cookieBtn.click().catch(() => {});
            }
        } catch (_) {}

        let searchInput = page.locator('input[formcontrolname="searchTerm"], input[placeholder*="código ou descrição" i], input[placeholder*="codigo ou descricao" i]').first();
        let inputVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);

        if (!inputVisible) {
            await page.goto('https://www.dpk.com.br/#/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(1500);
            try {
                const cookieBtn = page.locator('button:has-text("ENTENDI E FECHAR"), button:has-text("Entendi e fechar")').first();
                if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await cookieBtn.click().catch(() => {});
                }
            } catch (_) {}
            searchInput = page.locator('input[formcontrolname="searchTerm"], input[placeholder*="código ou descrição" i], input[placeholder*="codigo ou descricao" i]').first();
        }

        await searchInput.fill(query).catch(() => {});
        const searchBtn = page.locator('button:has-text("Buscar"), button.btn-buscar').first();
        if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await searchBtn.click().catch(() => {});
        } else {
            await page.keyboard.press('Enter').catch(() => {});
        }

        await page.waitForTimeout(2500);
        await Promise.race([
            page.locator('.column-view-card, .column-view, h2.mat-h4 a[href*="#/produtos/"], div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card, text="produtos encontrados"').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
            page.locator('.sem-resultados, text="Nao encontramos resultados", text="Não encontramos resultados", text="0 resultados"').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
        ]).catch(() => null);

        await page.waitForTimeout(1000);
    },
    extractItems: async ({ page }) => {
        return page.evaluate(() => {
            const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const normalizeKey = (value) => normalize(value)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
            const findText = (root, selectors) => {
                for (const selector of selectors) {
                    try {
                        const node = root.querySelector(selector);
                        if (!node) continue;
                        const text = normalize(node.textContent || '');
                        if (text) return text;
                    } catch (_) {}
                }
                return '';
            };
            const findMatch = (text, patterns) => {
                for (const pattern of patterns) {
                    const match = text.match(pattern);
                    if (match && match[1]) {
                        return normalize(match[1]);
                    }
                }
                return '';
            };

            const cards = Array.from(document.querySelectorAll(
                '.column-view-card, .column-view, div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card, mat-card, .product-item, .card-produto, .grid-produto'
            ));
            const items = [];

            for (const card of cards) {
                const text = normalize(card.textContent || '');
                if (!text) continue;

                const product =
                    findText(card, ['h2.mat-h4', 'h2', '.mat-h4', '.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]'])
                    || normalize(text.split('R$')[0].split('Fabricante:')[0]);
                const priceText =
                    findText(card, ['span.cor-preco', 'div.preco span.cor-preco', '.preco .cor-preco', '.price', '.preco', '.valor'])
                    || ((text.match(/R\$\s*[0-9.,]+/) || [])[0] || '');

                if (!product) continue;

                const stockText = findText(card, ['div.estoque', '.estoque']);
                const brandNode = Array.from(card.querySelectorAll('div.informacoes p strong, p strong, strong')).find((node) => {
                    const parentText = normalizeKey(node.parentElement?.textContent || '');
                    return /fabricante/.test(parentText) && !/cod/.test(parentText);
                });
                const factoryCodeNode = Array.from(card.querySelectorAll('div.fab strong, div.informacoes strong, strong')).find((node) => {
                    const parentText = normalizeKey(node.parentElement?.textContent || '');
                    return /cod\.?\s*(?:de|do)?\s*fabrica/.test(parentText);
                });

                const brand =
                    findMatch(text, [/Fabricante:\s*(.+?)\s*C[o\u00f3]d/i])
                    || normalize(brandNode?.textContent || '');
                const code =
                    findMatch(text, [
                        /C[o\u00f3]d\.?\s*(?:de|do)?\s*F[a\u00e1]brica:\s*([A-Z0-9./_-]+)/i,
                        /C[o\u00f3]d\.?\s*do\s*Produto:\s*([A-Z0-9./_-]+)/i,
                        /SKU:\s*([A-Z0-9./_-]+)/i,
                    ])
                    || normalize(factoryCodeNode?.textContent || '');
                const stock = ((stockText.match(/([0-9]+)\s*un/i) || [])[1] || (text.match(/([0-9]+)\s*un\.?\s*no estoque/i) || [])[1] || '0').trim();

                items.push({
                    nome: product,
                    preco: priceText,
                    codigo: code,
                    marca: brand,
                    estoque: stock,
                    link: window.location.href,
                });
            }

            return items;
        });
    },
    itemContainerSelector: ['.column-view-card', '.column-view', 'div.cardsAlinhamento > mat-card.produto-card', 'mat-card.produto-card'],
    productNameSelector: ['h2.mat-h4', 'h2', '.mat-h4'],
    priceSelector: ['span.cor-preco', 'div.preco span.cor-preco', '.preco .cor-preco'],
    codeSelector: ['div.fab strong', 'div.informacoes strong'],
    waitForResultsOnly: true,
    emptyResultSelector: ['text="Nao encontramos resultados"', 'text="Não encontramos resultados"', '.sem-resultados', 'text="0 resultados"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true,
};
