const fs = require('fs');
const path = require('path');

let cachedBootstrapState = null;

function formatHttpDiagnostic(response) {
    const safeHeaders = ['x-amz-cf-id', 'x-amz-cf-pop', 'x-cache', 'via', 'x-request-id', 'request-id'];
    const details = safeHeaders
        .map((name) => {
            const value = String(response.headers?.get(name) || '')
                .replace(/[\r\n]+/g, ' ')
                .trim()
                .slice(0, 180);
            return value ? `${name}=${value}` : '';
        })
        .filter(Boolean);

    return [`HTTP ${response.status}`, ...details].join('; ');
}

function normalizeAscii(value) {
    return String(value || '')
        .replace(/\0/g, '')
        .replace(/[^\x20-\x7E]/g, ' ');
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getDpkToken(user, pass) {
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
        return cachedToken;
    }

    const res = await fetch('https://api.dpk.com.br/api-auth/api/connect/token', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'origin': 'https://www.dpk.com.br',
            'referer': 'https://www.dpk.com.br/',
            'x-api-key': 'Zo7MoqWOQyaHdMJj053tB2Mx9IDJMKR97Y7d2T9a',
            'x-portal': 'DPK'
        },
        body: JSON.stringify({
            userPrincipalName: user || 'atendimento@centroautomotivo0058.com',
            password: pass || 'Re539597@'
        })
    });

    if (!res.ok) {
        throw new Error(`Autenticação da API DPK recusada: ${formatHttpDiagnostic(res)}`);
    }

    const data = await res.json();
    cachedToken = data.accessToken;
    try {
        const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
        tokenExpiresAt = (payload.exp || 0) * 1000;
    } catch (_) {
        tokenExpiresAt = Date.now() + 3600000;
    }

    return cachedToken;
}

async function directSearch({ supplier, query }) {
    const token = await getDpkToken(supplier?.loginCredential, supplier?.password);
    const authHeader = 'Bearer ' + token;
    const storeCode = '4'; // Goiania warehouse

    const searchRes = await fetch(`https://api.dpk.com.br/api-product/api/productSearch?Query=${encodeURIComponent(query)}&StoreCode=${storeCode}`, {
        headers: {
            'accept': 'application/json',
            'authorization': authHeader,
            'origin': 'https://www.dpk.com.br',
            'referer': 'https://www.dpk.com.br/',
            'x-api-key': 'Zo7MoqWOQyaHdMJj053tB2Mx9IDJMKR97Y7d2T9a',
            'x-portal': 'DPK'
        }
    });

    if (!searchRes.ok) {
        throw new Error(`Busca da API DPK recusada: ${formatHttpDiagnostic(searchRes)}`);
    }

    const searchData = await searchRes.json();
    const products = Array.isArray(searchData?.products) ? searchData.products : [];
    if (!products.length) {
        return [];
    }

    // Sort products: exact code matches first, then prefix matches
    const cleanQ = String(query || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    products.sort((a, b) => {
        const aCode = String(a.code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const bCode = String(b.code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (aCode === cleanQ && bCode !== cleanQ) return -1;
        if (aCode !== cleanQ && bCode === cleanQ) return 1;
        const aStart = aCode.startsWith(cleanQ);
        const bStart = bCode.startsWith(cleanQ);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;
        return 0;
    });

    // DPK's SAP server times out if asked for more than 5 items at once.
    // We take the top 6 most relevant items and query them in parallel chunks of 3.
    const targetProducts = products.slice(0, 6);
    const batches = [];
    for (let i = 0; i < targetProducts.length; i += 3) {
        batches.push(targetProducts.slice(i, i + 3));
    }

    const priceResponses = await Promise.all(
        batches.map(async (batch) => {
            const itemQuery = batch.map((p) => 'Item=' + p.sapCode).join('&');
            try {
                const res = await fetch(`https://api.dpk.com.br/dpk-price/api/price/dpk?StoreCode=${storeCode}&${itemQuery}`, {
                    headers: {
                        accept: 'application/json',
                        authorization: authHeader,
                        origin: 'https://www.dpk.com.br',
                        referer: 'https://www.dpk.com.br/',
                        'x-api-key': 'Zo7MoqWOQyaHdMJj053tB2Mx9IDJMKR97Y7d2T9a',
                        'x-portal': 'DPK',
                    },
                    signal: AbortSignal.timeout(8000),
                });
                if (!res.ok) {
                    return { requestError: `Consulta de preço DPK recusada: ${formatHttpDiagnostic(res)}` };
                }
                return await res.json();
            } catch (error) {
                const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError'
                    ? 'timeout após 8s'
                    : 'falha de rede ao consultar preços';
                return { requestError: `Consulta de preço DPK: ${reason}.` };
            }
        })
    );

    const priceMap = new Map();
    const priceErrors = [];
    for (const list of priceResponses) {
        if (Array.isArray(list)) {
            for (const item of list) {
                priceMap.set(String(item.id), item);
            }
        } else if (list?.requestError) {
            priceErrors.push(list.requestError);
        }
    }

    const results = targetProducts.map(p => {
        const priceInfo = priceMap.get(String(p.sapCode)) || {};
        const price = Number(priceInfo.price || 0);
        const stock = Number(priceInfo.stock || 0);

        return {
            provider: 'DPK',
            product: p.description,
            preco: price > 0 ? `R$ ${price.toFixed(2).replace('.', ',')}` : '',
            price: price > 0 ? price : 0,
            available: stock > 0,
            link: `https://www.dpk.com.br/#/produtos/${p.id}/${encodeURIComponent((p.description || '').replace(/\s+/g, '-'))}`,
            code: p.code,
            brand: p.manufacturer || '',
            application: '',
            stock: stock,
            stockText: stock > 0 ? `${stock}un. no estoque` : 'Sem estoque',
            variantKey: `${p.description || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        };
    }).filter(p => p.price > 0);

    if (results.length === 0 && priceErrors.length > 0) {
        return {
            provider: supplier?.name || 'DPK',
            product: query,
            price: '---',
            available: false,
            error: `API DPK encontrou produtos, mas não conseguiu consultar preços. ${priceErrors.join(' | ')}`,
            debug: { source: 'DPK API', phase: 'price' },
        };
    }

    return results;
}

module.exports = {
    key: 'dpk',
    matches: (supplierName) => supplierName.toLowerCase().includes('dpk'),
    directSearch,
    directSearchFailureIsFinal: true,
    authenticatedUrl: 'https://www.dpk.com.br/#/',
    userSelector: ['input[type="email"]', 'input[formcontrolname="userPrincipalName"]', 'input[formcontrolname="email"]', 'input[name="login"]'],
    passSelector: ['input[type="password"]', 'input[formcontrolname="password"]', 'input[formcontrolname="senha"]'],
    submitSelector: ['button:has-text("Entrar")', 'button[type="submit"]'],
    loginSuccessSelector: [
        'text=Depósito',
        'text=GOIANIA',
        'text=Financeiro',
        'input[formcontrolname="searchTerm"]',
        'mat-icon:has-text("shopping_cart")',
        '.product-list__row'
    ],
    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();
        const user = supplier?.loginCredential || 'atendimento@centroautomotivo0058.com';
        const pass = supplier?.password || 'Re539597@';

        const emailInput = page.locator('input[type="email"], input[formcontrolname="userPrincipalName"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await fillVisibleLocator(emailInput, user);

        const passInput = page.locator('input[type="password"], input[formcontrolname="password"]').first();
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await fillVisibleLocator(passInput, pass);

        const submitBtn = page.locator('button:has-text("Entrar")').first();
        await page.waitForTimeout(500);
        await submitBtn.click();

        await Promise.race([
            page.waitForURL((url) => !url.href.includes('login'), { timeout: 15000 }).catch(() => null),
            page.locator('text=Financeiro, text=Depósito, input[formcontrolname="searchTerm"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
        ]);
        await page.waitForTimeout(3000);
    },
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
    performSearch: async ({ page, query, supplier }) => {
        try {
            const cookieBtn = page.locator('button:has-text("ENTENDI E FECHAR"), button:has-text("Entendi e fechar")').first();
            if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await cookieBtn.click().catch(() => {});
            }
        } catch (_) {}

        // Auto-cura: se a pagina caiu no login, preenche credenciais e loga imediatamente
        const emailInput = page.locator('input[type="email"], input[formcontrolname="userPrincipalName"]').first();
        if (await emailInput.isVisible({ timeout: 1500 }).catch(() => false)) {
            console.log('[DPK] Na tela de login. Efetuando login automatico...');
            await emailInput.fill(supplier?.loginCredential || 'atendimento@centroautomotivo0058.com');
            const passInput = page.locator('input[type="password"], input[formcontrolname="password"]').first();
            await passInput.fill(supplier?.password || 'Re539597@');
            const submitBtn = page.locator('button:has-text("Entrar")').first();
            await submitBtn.click();
            await page.waitForTimeout(4000);
        }

        const targetSearchUrl = `https://www.dpk.com.br/#/busca-produto?termo=${encodeURIComponent(query)}`;
        await page.goto(targetSearchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(3000);

        try {
            const cookieBtn = page.locator('button:has-text("ENTENDI E FECHAR"), button:has-text("Entendi e fechar")').first();
            if (await cookieBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await cookieBtn.click().catch(() => {});
            }
        } catch (_) {}

        let searchInput = page.locator('input[formcontrolname="searchTerm"], input[placeholder*="código ou descrição" i], input[placeholder*="codigo ou descricao" i]').first();
        if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await searchInput.fill(query).catch(() => {});
            const searchBtn = page.locator('button:has-text("Buscar"), button.btn-buscar').first();
            if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await searchBtn.click().catch(() => {});
            } else {
                await page.keyboard.press('Enter').catch(() => {});
            }
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
                'article.product-list__row, .product-list__row, .column-view-card, .column-view, div.cardsAlinhamento > mat-card.produto-card, mat-card.produto-card, mat-card, .product-item, .card-produto, .grid-produto'
            ));
            const items = [];

            for (const card of cards) {
                const text = normalize(card.textContent || '');
                if (!text) continue;

                const product =
                    findText(card, ['.product-list__name', 'h2.mat-h4', 'h2', '.mat-h4', '.product-name', '.product-title', '.descricao-produto', 'a[href*="#/produtos/"]'])
                    || normalize(text.split('R$')[0].split('Fabricante:')[0]);
                const priceText =
                    findText(card, ['.product-list__price strong', '.product-list__price', 'span.cor-preco', 'div.preco span.cor-preco', '.preco .cor-preco', '.price', '.preco', '.valor'])
                    || ((text.match(/R\$\s*[0-9.,]+/) || [])[0] || '');

                if (!product) continue;

                const stockText = findText(card, ['.product-list__availability strong', '.product-list__availability', 'div.estoque', '.estoque']);
                const brandNode = Array.from(card.querySelectorAll('.product-list__manufacturer strong, div.informacoes p strong, p strong, strong')).find((node) => {
                    const parentText = normalizeKey(node.parentElement?.textContent || '');
                    return /fabricante/.test(parentText) && !/cod/.test(parentText);
                });
                const factoryCodeNode = Array.from(card.querySelectorAll('.product-list__codes strong, div.fab strong, div.informacoes strong, strong')).find((node) => {
                    const parentText = normalizeKey(node.parentElement?.textContent || '');
                    return /cod\.?\s*(?:de|do)?\s*fabrica/.test(parentText) || /cod/.test(parentText);
                });

                const brand =
                    findText(card, ['.product-list__manufacturer strong'])
                    || findMatch(text, [/Fabricante:\s*(.+?)\s*C[o\u00f3]d/i])
                    || normalize(brandNode?.textContent || '');
                const code =
                    findText(card, ['.product-list__codes span strong', '.product-list__codes strong'])
                    || findMatch(text, [
                        /C[o\u00f3]d\.?\s*(?:de|do)?\s*F[a\u00e1]brica:\s*([A-Z0-9./_-]+)/i,
                        /C[o\u00f3]d\.?\s*do\s*Produto:\s*([A-Z0-9./_-]+)/i,
                        /SKU:\s*([A-Z0-9./_-]+)/i,
                    ])
                    || normalize(factoryCodeNode?.textContent || '');
                const stock = ((stockText.match(/([0-9]+)\s*un/i) || [])[1] || (text.match(/([0-9]+)\s*un\.?\s*no estoque/i) || [])[1] || '0').trim();

                const linkEl = card.querySelector('a[href*="#/produtos/"]');
                const link = linkEl ? linkEl.href : window.location.href;

                items.push({
                    nome: product,
                    preco: priceText,
                    codigo: code,
                    marca: brand,
                    estoque: stock,
                    estoqueTexto: stockText || `${stock} un`,
                    link,
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
