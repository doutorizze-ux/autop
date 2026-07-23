const fs = require('fs');
const path = require('path');

let cachedBootstrapState = null;

function normalizeAscii(value) {
    return String(value || '')
        .replace(/\0/g, '')
        .replace(/[^\x20-\x7E]/g, ' ');
}

function collectLevelDbText(levelDbPath) {
    if (!fs.existsSync(levelDbPath)) {
        return '';
    }

    const files = fs.readdirSync(levelDbPath)
        .filter((fileName) => /\.(ldb|log)$/i.test(fileName))
        .sort();

    let combined = '';

    for (const fileName of files) {
        const filePath = path.join(levelDbPath, fileName);
        try {
            combined += `\n${normalizeAscii(fs.readFileSync(filePath, 'utf8'))}`;
        } catch (_) {
            try {
                combined += `\n${normalizeAscii(fs.readFileSync(filePath))}`;
            } catch (_) {}
        }
    }

    return combined;
}

function readBootstrapStateFromChrome() {
    if (cachedBootstrapState !== null) {
        return cachedBootstrapState;
    }

    const chromeRoot = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb')
        : '';

    const rawText = collectLevelDbText(chromeRoot);
    if (!rawText) {
        cachedBootstrapState = null;
        return null;
    }

    const tokenAccessMatch = rawText.match(/token\.access[\s\S]{0,80}(eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/i);
    const tokenRefreshMatch = rawText.match(/token\.refresh[\s\S]{0,80}(eyJ[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)/i);
    const cnpjMatch = rawText.match(/(?:customer|selected)\.cnpj[^0-9]{0,80}([0-9]{14})/i);
    const warehouseMatch = rawText.match(/(?:customer\.warehouse|selected\.warehouse|warehouse)[\s\S]{0,120}(\{"id"[^{}]{0,1000}"priceId":[0-9]+[^{}]{0,1000}\})/i);
    const tokenRefresh = tokenRefreshMatch?.[1] || '';
    const tokenAccess = tokenAccessMatch?.[1] || tokenRefresh;
    const warehouseJson = warehouseMatch?.[1] || '';

    if (!tokenAccess || !cnpjMatch || !warehouseJson) {
        cachedBootstrapState = null;
        return null;
    }

    try {
        const warehouse = JSON.parse(warehouseJson);
        cachedBootstrapState = {
            cnpj: cnpjMatch[1],
            warehouse,
            tokenAccess,
            tokenRefresh,
        };
        return cachedBootstrapState;
    } catch (_) {
        cachedBootstrapState = null;
        return null;
    }
}

module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    userSelector: ['input[type="email"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="senha"]'],
    loginSuccessSelector: ['a[href*="logout"]', '.user-info', 'button.btn-buscar', 'input[formcontrolname="descricao"]'],
    searchSelector: [
        'input[formcontrolname="descricao"]',
        'input[role="search"]',
        'input[placeholder*="codigo ou descricao" i]',
        'input[placeholder*="cÃ³digo ou descriÃ§Ã£o" i]',
    ],
    searchButtonSelector: ['button.btn-buscar', '.btn-buscar'],
    buildSearchUrl: (query) => `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`,
    preferProfileOverSessionData: true,
    preparePage: async ({ page }) => {
        const state = readBootstrapStateFromChrome();
        if (!state) {
            return;
        }

        await page.addInitScript((payload) => {
            const applyState = () => {
                try {
                    localStorage.setItem('customer.cnpj', payload.cnpj);
                    localStorage.setItem('selected.cnpj', payload.cnpj);
                    localStorage.setItem('customer.warehouse', JSON.stringify(payload.warehouse));
                    localStorage.setItem('selected.warehouse', JSON.stringify(payload.warehouse));
                    localStorage.setItem('warehouse', JSON.stringify(payload.warehouse));
                    localStorage.setItem('token.access', payload.tokenAccess);
                    localStorage.setItem('token.refresh', payload.tokenRefresh);
                } catch (_) {}
            };

            applyState();
            window.addEventListener('DOMContentLoaded', applyState, { once: true });
        }, state);
    },
    performSearch: async ({ page, query }) => {
        const targetUrl = `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await Promise.race([
            page.locator('.column-view-card, .column-view, h2.mat-h4 a[href*="#/produtos/"], div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => null),
            page.locator('.sem-resultados, text="Nao encontramos resultados", text="Nao encontramos resultados", text="0 resultados"').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => null),
        ]).catch(() => null);
        await page.waitForTimeout(500);
        await page.waitForFunction(() => {
            const cards = Array.from(document.querySelectorAll('.column-view-card, div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card'));
            if (!cards.length) return false;

            const hasPrice = cards.some((card) => /R\$\s*[0-9.,]+/.test(card.textContent || ''));
            const hasUnavailable = cards.some((card) => /avise-me quando chegar|produto indispon[i\u00ed]vel/i.test(card.textContent || ''));
            const hasVisibleSpinner = cards.some((card) => Array.from(card.querySelectorAll('mat-progress-spinner')).some((spinner) => {
                const rect = spinner.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }));

            return hasPrice || (hasUnavailable && !hasVisibleSpinner);
        }, null, { timeout: 20000 }).catch(() => {});
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
    emptyResultSelector: ['text="Nao encontramos resultados"', 'text="NÃ£o encontramos resultados"', '.sem-resultados', 'text="0 resultados"'],
    navigateToAuthenticatedAfterLogin: true,
    preferStrategySelectors: true,
};
