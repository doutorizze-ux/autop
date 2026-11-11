const fs = require('fs');
const path = require('path');
const { safeString } = require('./shared');

const RMP_BASE_URL = 'https://loja.rmp.com.br';
const RMP_SIGNIN_URL = 'https://loja.rmp.com.br/auth/sign-in';
const RMP_HOME_URL = 'https://loja.rmp.com.br/home';
const COLETOR_API_BASE = 'https://coletor.greal.com.br/api/v1/ecommerce/products/search';

function getStoredAccessToken() {
    try {
        const sessionPath = path.resolve(__dirname, '../sessions/real-moto-pecas-rmp.json');
        if (!fs.existsSync(sessionPath)) return '';

        const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        const origins = session.origins || [];
        for (const origin of origins) {
            if (origin.origin && origin.origin.includes('rmp.com.br')) {
                const ls = origin.localStorage || [];
                const entry = ls.find((x) => x.name === 'cockpit.ecomm.identity.session');
                if (entry && entry.value) {
                    const parsed = JSON.parse(entry.value);
                    if (parsed && parsed.accessToken) {
                        return parsed.accessToken;
                    }
                }
            }
        }
    } catch (_) {}
    return '';
}

function isStrictCodeQuery(query) {
    const clean = String(query || '').trim();
    return /^[A-Za-z0-9./_-]{2,}$/.test(clean) && !/\s/.test(clean);
}

function matchesQueryCode(query, item) {
    if (!isStrictCodeQuery(query)) {
        return true;
    }

    const cleanQuery = String(query).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleanQuery) return true;

    const itemCode = String(item.code || item.codigo || item.productGestCode || item.productCode || item.sku || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (itemCode) {
        if (itemCode === cleanQuery || itemCode.startsWith(cleanQuery) || cleanQuery.startsWith(itemCode)) {
            return true;
        }
    }

    const fullText = [
        item.nome,
        item.name,
        item.product,
        item.description,
        item.application,
        item.applicationSummary,
        item.textoCompleto,
    ].filter(Boolean).join(' ');

    const cleanText = fullText.replace(/[^A-Za-z0-9]/g, ' ').toUpperCase();
    const tokens = cleanText.split(/\s+/).filter(Boolean);
    return tokens.includes(cleanQuery);
}

function mapApiItemsToNormalized(rawItems, query) {
    if (!Array.isArray(rawItems)) return [];

    return rawItems.map((item) => {
        const description = safeString(item.description || item.name || '').trim();
        const code = safeString(item.productGestCode || item.productCode || item.sku || '').trim();
        const manufacturer = safeString(item.manufacturer || item.brand || '').trim();
        const price = Number(item.finalUnitPrice || item.unitPriceWithTaxes || item.unitPrice || 0);
        const stock = Number(item.stockQuantityAvailable ?? (item.availableOtherBranches ? 1 : 0));
        const branch = safeString(item.stockBranchName || 'Goiânia').trim();
        const application = safeString(item.applicationSummary || '').trim();
        const isAvailable = item.isAvailableForSale !== false && (stock > 0 || item.availableOtherBranches);

        return {
            nome: description,
            product: description,
            preco: price,
            price: price,
            codigo: code,
            code: code,
            marca: manufacturer,
            brand: manufacturer,
            estoque: stock,
            stock: stock,
            estoqueTexto: stock > 0 ? `${stock} un. (${branch})` : (item.availableOtherBranches ? 'Outras filiais' : 'Sem estoque'),
            stockText: stock > 0 ? `${stock} un. (${branch})` : (item.availableOtherBranches ? 'Outras filiais' : 'Sem estoque'),
            disponivel: isAvailable,
            available: isAvailable,
            aplicacao: application,
            application: application,
            link: item.sku ? `${RMP_BASE_URL}/product/${item.sku}` : `${RMP_BASE_URL}/products/search?q=${encodeURIComponent(query)}`,
            textoCompleto: `${description} ${code} ${manufacturer} ${application}`,
        };
    }).filter((it) => {
        if (!(it.preco > 0)) return false;
        if (query && !matchesQueryCode(query, it)) return false;
        return true;
    });
}

module.exports = {
    key: 'rmp',
    matches: (supplierName) => supplierName.includes('real moto') || supplierName.includes('rmp'),
    authenticatedUrl: RMP_HOME_URL,
    loginUrl: RMP_SIGNIN_URL,
    userSelector: [
        '#username',
        'input[formcontrolname="username"]',
        'input[placeholder*="e-mail" i]',
        'input[placeholder*="cnpj" i]',
        'input[type="text"]',
    ],
    passSelector: [
        '#password',
        'input[formcontrolname="password"]',
        'input[placeholder*="senha" i]',
        'input[type="password"]',
    ],
    submitSelector: [
        'button[type="submit"]',
        'button:has-text("Entrar")',
    ],
    loginSuccessSelector: [
        'input[type="search"]',
        'input[placeholder*="Buscar" i]',
        'a[href*="logout"]',
        '.customer-name',
        'button[aria-label*="perfil" i]',
    ],
    searchSelector: [
        'input[type="search"]',
        'input[placeholder*="Buscar" i]',
        'article.product-row',
    ],
    itemContainerSelector: [
        'article.product-row',
        'article[class*="product"]',
        'article',
    ],
    productNameSelector: [
        'h2',
        'h3',
        '.product-name',
        '.product-description',
    ],
    priceSelector: [
        '[class*="price"]',
        '.price',
        'strong',
        'span',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,

    // 1. Busca direta ultrarrápida via API coletor RMP
    directSearch: async ({ supplier, query }) => {
        const token = getStoredAccessToken();
        if (!token) {
            throw new Error('Token RMP não encontrado no armazenamento local.');
        }

        const cleanQuery = safeString(query).trim();
        const apiUrl = `${COLETOR_API_BASE}?page=0&size=12&sort=relevance&vehicleSearch=false&compatibleProducts=false&q=${encodeURIComponent(cleanQuery)}&limit=30`;

        const res = await fetch(apiUrl, {
            headers: {
                'authorization': `Bearer ${token}`,
                'accept': 'application/json',
                'x-store-host': RMP_BASE_URL,
            },
        });

        if (!res.ok) {
            throw new Error(`API Coletor RMP HTTP ${res.status}`);
        }

        const data = await res.json();
        const items = mapApiItemsToNormalized(data.items, cleanQuery);
        console.error(`[RMP directSearch] Sucesso! ${items.length} itens encontrados para "${cleanQuery}".`);
        return items;
    },

    // 2. Fallback de login automatizado na nova estrutura
    fillLogin: async ({ page, supplier }) => {
        console.error('[RMP] Executando preenchimento de login na nova estrutura...');
        const user = supplier?.loginCredential || 'centroautomotivo0058@hotmail.com';
        const pass = supplier?.password || 'Ren@n0058@';

        const userLoc = page.locator('#username, input[formcontrolname="username"]').first();
        const passLoc = page.locator('#password, input[formcontrolname="password"]').first();

        await userLoc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await userLoc.fill(user);

        await passLoc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await passLoc.fill(pass);

        const submitBtn = page.locator('button[type="submit"], button:has-text("Entrar")').first();
        await submitBtn.click().catch(() => {});
    },

    afterLogin: async ({ page, context }) => {
        console.error('[RMP] Aguardando autenticação e persistindo sessão...');
        await page.waitForURL((url) => !url.href.includes('sign-in') && !url.href.includes('auth'), { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(3000);

        try {
            const sessionPath = path.resolve(__dirname, '../sessions/real-moto-pecas-rmp.json');
            const state = await context.storageState();
            fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
            console.error('[RMP] Sessão atualizada e gravada com sucesso!');
        } catch (e) {
            console.error(`[RMP] Falha ao persistir sessão: ${e.message}`);
        }
    },

    buildSearchUrl: (query) => {
        const clean = safeString(query).trim();
        return `${RMP_BASE_URL}/products/search?page=0&size=12&sort=relevance&vehicleSearch=false&compatibleProducts=false&q=${encodeURIComponent(clean)}&limit=30`;
    },

    // 3. Execução de busca no navegador com consulta direta via evaluate
    performSearch: async ({ page, query, supplier }) => {
        const cleanQuery = safeString(query).trim();
        const searchUrl = `${RMP_BASE_URL}/products/search?page=0&size=12&sort=relevance&vehicleSearch=false&compatibleProducts=false&q=${encodeURIComponent(cleanQuery)}&limit=30`;

        console.error(`[RMP performSearch] Navegando para ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(1500);

        // Se redirecionou para login, faz o login na hora
        if (page.url().includes('sign-in') || page.url().includes('auth')) {
            console.error('[RMP performSearch] Redirecionado para sign-in; realizando login...');
            const user = supplier?.loginCredential || 'centroautomotivo0058@hotmail.com';
            const pass = supplier?.password || 'Ren@n0058@';

            const userLoc = page.locator('#username, input[formcontrolname="username"]').first();
            const passLoc = page.locator('#password, input[formcontrolname="password"]').first();
            await userLoc.fill(user).catch(() => {});
            await passLoc.fill(pass).catch(() => {});
            await page.click('button[type="submit"]').catch(() => {});

            await page.waitForURL((url) => !url.href.includes('sign-in'), { timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(2000);
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(2000);
        }
    },

    // 4. Extração de itens (tenta via coletor API no contexto da página e fallback DOM)
    extractItems: async ({ page, query }) => {
        const cleanQuery = safeString(query).trim();

        // Tentativa A: Consultar API pelo evaluate da página autenticada
        const apiResult = await page.evaluate(async (q) => {
            try {
                let token = '';
                const sessionRaw = localStorage.getItem('cockpit.ecomm.identity.session');
                if (sessionRaw) {
                    const sessionObj = JSON.parse(sessionRaw);
                    token = sessionObj.accessToken;
                }
                if (!token) return null;

                const url = `https://coletor.greal.com.br/api/v1/ecommerce/products/search?page=0&size=12&sort=relevance&vehicleSearch=false&compatibleProducts=false&q=${encodeURIComponent(q)}&limit=30`;
                const res = await fetch(url, {
                    headers: {
                        'authorization': `Bearer ${token}`,
                        'accept': 'application/json',
                        'x-store-host': 'https://loja.rmp.com.br',
                    },
                });

                if (!res.ok) return null;
                const data = await res.json();
                return data.items || [];
            } catch (_) {
                return null;
            }
        }, cleanQuery);

        if (Array.isArray(apiResult) && apiResult.length > 0) {
            console.error(`[RMP extractItems] Extraídos ${apiResult.length} itens via API nativa da página.`);
            return mapApiItemsToNormalized(apiResult, cleanQuery);
        }

        // Tentativa B: Extrair via DOM da nova grade de produtos
        console.error('[RMP extractItems] Tentando extração via DOM dos cards...');
        const domItems = await page.evaluate((q) => {
            const articles = Array.from(document.querySelectorAll('article.product-row, article[class*="product"], article'));
            const results = [];

            for (const art of articles) {
                const text = String(art.innerText || '').trim();
                if (!text || !text.includes('R$')) continue;

                const priceMatch = text.match(/R\$\s*([0-9.]+,\d{2})/);
                if (!priceMatch) continue;

                const cleanPrice = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
                if (!(cleanPrice > 0)) continue;

                const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
                const title = lines[0] || '';

                const codeMatch = text.match(/CÓD:\s*([A-Z0-9./_-]+)/i) || text.match(/C[o\u00f3]d(?:igo)?:\s*([A-Z0-9./_-]+)/i);
                const brandMatch = text.match(/FABRICANTE:\s*([A-Z0-9 .&/-]+)/i);

                const hasStockGoiania = /GOIÂNIA/i.test(text) && !/Indisponível/i.test(text);

                results.push({
                    nome: title,
                    product: title,
                    preco: cleanPrice,
                    price: cleanPrice,
                    codigo: codeMatch ? codeMatch[1].trim() : '',
                    code: codeMatch ? codeMatch[1].trim() : '',
                    marca: brandMatch ? brandMatch[1].trim() : '',
                    brand: brandMatch ? brandMatch[1].trim() : '',
                    estoque: hasStockGoiania ? 1 : 0,
                    stock: hasStockGoiania ? 1 : 0,
                    estoqueTexto: hasStockGoiania ? 'Disponível em Goiânia' : 'Sem estoque local',
                    stockText: hasStockGoiania ? 'Disponível em Goiânia' : 'Sem estoque local',
                    disponivel: hasStockGoiania || /Disponível/i.test(text),
                    available: hasStockGoiania || /Disponível/i.test(text),
                    textoCompleto: text,
                    link: window.location.href,
                });
            }

            return results;
        }, cleanQuery);

        console.error(`[RMP extractItems] Extraídos ${domItems.length} itens via DOM.`);
        return domItems;
    },
};
