const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { resolveStrategy } = require('./suppliers');
const { safeString, buildSelectorList } = require('./suppliers/shared');

function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const match = String(priceStr).match(/([0-9.,]+)/);
    if (!match) return 0;
    const clean = match[1].replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getSessionStatePath(supplier) {
    const sessionsDir = path.join(__dirname, 'sessions');
    ensureDirectory(sessionsDir);

    const fileName = safeString(supplier.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    return path.join(sessionsDir, `${fileName || 'supplier'}.json`);
}

async function waitForAnyVisible(page, selectors, timeout = 15000) {
    let lastError;

    for (const selector of selectors) {
        try {
            await page.locator(selector).first().waitFor({ state: 'visible', timeout });
            return selector;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`Nenhum seletor visível encontrado. Tentados: ${selectors.join(' | ')}. ${lastError ? `Último erro: ${lastError.message}` : ''}`);
}

async function fillFirstVisible(page, selectors, value, options = {}) {
    const selector = await waitForAnyVisible(page, selectors, options.timeout);
    await page.locator(selector).first().fill(safeString(value), { force: true });
    return selector;
}

async function fillVisibleLocator(locator, value) {
    await locator.click({ force: true }).catch(() => {});
    await locator.press('Control+A').catch(() => {});
    await locator.fill('');
    await locator.fill(safeString(value), { force: true });
}

async function getVisibleLocators(page, selectors, timeout = 4000) {
    const locators = [];

    for (const selector of selectors) {
        try {
            const locator = page.locator(selector);
            const count = await locator.count();

            for (let index = 0; index < count; index += 1) {
                const current = locator.nth(index);
                const isVisible = await current.isVisible({ timeout }).catch(() => false);
                const isEnabled = await current.isEnabled().catch(() => true);

                if (isVisible && isEnabled) {
                    locators.push(current);
                }
            }
        } catch (_) {}
    }

    return locators;
}

async function waitForPageSettle(page, selectors = [], options = {}) {
    const timeout = options.timeout ?? 7000;
    const settleMs = options.settleMs ?? 1500;
    const previousUrl = safeString(options.previousUrl || page.url());
    const waiters = [];

    if (previousUrl) {
        waiters.push(
            page.waitForURL((url) => url.toString() !== previousUrl, { timeout }).catch(() => null)
        );
    }

    for (const selector of selectors) {
        try {
            waiters.push(page.locator(selector).first().waitFor({ state: 'visible', timeout }).catch(() => null));
        } catch (_) {}
    }

    await Promise.race(waiters).catch(() => null);
    await page.waitForTimeout(settleMs);
}

async function waitForLoginCompletion(page, previousUrl, loginUrl, supplier, strategy = {}) {
    const successSelectors = buildSelectorList(
        strategy.loginSuccessSelector,
        supplier.searchBarSelector,
        strategy.searchSelector
    );

    await waitForPageSettle(page, successSelectors, {
        timeout: strategy.loginSettleTimeout ?? 15000,
        settleMs: strategy.loginSettleDelay ?? 2500,
        previousUrl,
    });

    await dismissTransientUi(page);
    await ensureLoggedIn(page, loginUrl, supplier, strategy);
}

function buildSearchQueries(productName) {
    const baseQuery = safeString(productName);
    const queries = [baseQuery];
    const tokens = baseQuery
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    for (const token of tokens) {
        if (!queries.includes(token)) {
            queries.push(token);
        }
    }

    return queries.slice(0, 4);
}

async function clickFirstVisible(page, selectors, options = {}) {
    const selector = await waitForAnyVisible(page, selectors, options.timeout);
    await page.locator(selector).first().click({ force: true });
    return selector;
}

async function dismissTransientUi(page) {
    const dismissSelectors = [
        'button:has-text("Aceitar")',
        'button:has-text("Agora não")',
        'button:has-text("Agora nao")',
        'button:has-text("Permitir Cookies")',
        'button:has-text("Fechar")',
        '[aria-label="Close"]',
        '.modal button.close',
    ];

    for (const selector of dismissSelectors) {
        try {
            const locator = page.locator(selector).first();
            if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
                await locator.click({ force: true, timeout: 1000 }).catch(() => {});
            }
        } catch (_) {}
    }
}

async function setCheckboxState(page, selectors, checked) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            await locator.waitFor({ state: 'visible', timeout: 2000 });
            const current = await locator.isChecked().catch(() => null);
            if (current !== null && current !== checked) {
                await locator.click({ force: true });
            }
            return true;
        } catch (_) {}
    }
    return false;
}

async function submitLogin(page, supplier, fallbackSelectors = []) {
    const selectors = buildSelectorList(
        supplier.loginSubmitSelector,
        fallbackSelectors,
        [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Entrar")',
            'button:has-text("Login")',
        ]
    );

    try {
        await clickFirstVisible(page, selectors, { timeout: 8000 });
    } catch (_) {
        await page.keyboard.press('Enter');
    }
}

async function runGenericLogin(page, supplier, strategy = {}) {
    if (strategy.fillLogin) {
        await strategy.fillLogin({
            page,
            supplier,
            fillVisibleLocator,
            getVisibleLocators: (selectors, timeout) => getVisibleLocators(page, selectors, timeout),
            dismissTransientUi: () => dismissTransientUi(page),
        });
        await submitLogin(page, supplier, strategy.submitSelector);
        return;
    }

    const extraSelectors = buildSelectorList(
        supplier.loginExtraSelector,
        strategy.extraSelector,
        ['select', 'input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]']
    );
    const userSelectors = buildSelectorList(
        supplier.loginUserSelector,
        strategy.userSelector,
        [
            'input[type="email"]',
            'input[name*="user" i]',
            'input[name*="login" i]',
            'input[name*="cnpj" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="usu" i]',
            'input[placeholder*="cnpj" i]',
            'input:not([type="hidden"]):not([type="password"])',
        ]
    );
    const passSelectors = buildSelectorList(
        supplier.loginPassSelector,
        strategy.passSelector,
        ['input[type="password"]']
    );

    if (supplier.loginExtraValue) {
        for (const selector of extraSelectors) {
            try {
                const locator = page.locator(selector).first();
                await locator.waitFor({ state: 'visible', timeout: 4000 });

                const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
                if (tagName === 'select') {
                    await locator.selectOption(safeString(supplier.loginExtraValue));
                } else {
                    await locator.fill(safeString(supplier.loginExtraValue), { force: true });
                }
                break;
            } catch (_) {}
        }
    }

    if (strategy.beforeLogin) {
        await strategy.beforeLogin({
            page,
            supplier,
            dismissTransientUi: () => dismissTransientUi(page),
            setCheckboxState: (selectors, checked) => setCheckboxState(page, selectors, checked),
        });
    }

    const loginValue = supplier.loginCredential || supplier.loginExtraValue;
    if (!loginValue) {
        throw new Error('Fornecedor sem credencial de login configurada.');
    }

    await dismissTransientUi(page);
    await fillFirstVisible(page, userSelectors, loginValue);
    await dismissTransientUi(page);
    await fillFirstVisible(page, passSelectors, supplier.password || '');
    await submitLogin(page, supplier, strategy.submitSelector);
}

async function performSearch(page, supplier, query, strategy = {}) {
    if (strategy.buildSearchUrl) {
        const directUrl = strategy.buildSearchUrl(query, supplier);
        if (directUrl) {
            await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
            return;
        }
    }

    const searchSelectors = buildSelectorList(
        supplier.searchBarSelector,
        strategy.searchSelector,
        [
            'input[type="search"]',
            'input[placeholder*="busca" i]',
            'input[placeholder*="código" i]',
            'input[placeholder*="codigo" i]',
            'input[placeholder*="descrição" i]',
            'input[placeholder*="descricao" i]',
            'input[placeholder*="produto" i]',
            'input[placeholder*="peça" i]',
            'input[placeholder*="peca" i]',
            'input:not([type="hidden"]):not([type="password"])',
        ]
    );
    const searchButtonSelectors = buildSelectorList(
        supplier.searchBtnSelector,
        strategy.searchButtonSelector,
        [
            'button[type="submit"]',
            'button:has-text("Buscar")',
            'button:has-text("Pesquisar")',
            '.search-btn',
        ]
    );

    const selector = await waitForAnyVisible(page, searchSelectors, 15000);
    const input = page.locator(selector).first();
    await input.click({ force: true }).catch(() => {});
    await input.press('Control+A').catch(() => {});
    await input.fill('');
    await input.fill(query, { force: true });

    try {
        await clickFirstVisible(page, searchButtonSelectors, { timeout: 3000 });
    } catch (_) {
        await input.press('Enter');
    }
}

function buildBrowserPayload(items, supplier) {
    return items.map((item) => ({
        provider: supplier.name,
        product: safeString(item.nome || item.name || item.product),
        price: parsePrice(item.preco || item.price),
        available: true,
        link: safeString(item.link || supplier.url),
        code: safeString(item.codigo || item.code),
        brand: safeString(item.marca || item.brand),
        application: safeString(item.aplicacao || item.application),
        stock: parseInt(item.estoque || item.stock || 0, 10) || 0,
    })).filter((item) => item.price > 0);
}

async function extractWithConfiguredSelectors(page, supplier) {
    const selectors = buildSelectorList(
        supplier.itemContainerSelector,
        ['.product-card', '.produto', '.item', 'article', 'tr']
    );
    const nameSelectors = buildSelectorList(
        supplier.productNameSelector,
        ['.name', '.nome', '.title', '.titulo', 'h2', 'h3', 'td']
    );
    const priceSelectors = buildSelectorList(
        supplier.priceSelector,
        ['.price', '.preco', '.valor', '[class*="price"]', '[class*="preco"]', '[class*="valor"]']
    );
    const stockSelectors = buildSelectorList(
        supplier.availableSelector,
        ['.stock', '.estoque', '.available', '.disponivel']
    );

    return page.evaluate(({ selectors, nameSelectors, priceSelectors, stockSelectors }) => {
        const tryText = (root, candidates) => {
            for (const candidate of candidates) {
                try {
                    const node = root.querySelector(candidate);
                    if (node && node.textContent) {
                        const text = node.textContent.trim();
                        if (text) return text;
                    }
                } catch (_) {}
            }
            return '';
        };

        const elements = [];
        for (const selector of selectors) {
            try {
                const found = Array.from(document.querySelectorAll(selector));
                if (found.length) {
                    elements.push(...found);
                    break;
                }
            } catch (_) {}
        }

        const uniqueElements = Array.from(new Set(elements));
        return uniqueElements.map((el) => {
            const text = (el.textContent || '').trim();
            const nome = tryText(el, nameSelectors) || text.split('\n')[0] || '';
            const preco = tryText(el, priceSelectors) || (text.match(/R\$\s?[0-9.,]+/) || [''])[0];
            const estoqueTexto = tryText(el, stockSelectors) || '';
            const codigo = (text.match(/(?:Cód(?:igo)?|Cod(?:igo)?|Ref)[:\s]*([A-Za-z0-9.-]+)/i) || [null, ''])[1];
            const marca = (text.match(/(?:Marca)[:\s]*([^\n]+)/i) || [null, ''])[1];
            const aplicacao = (text.match(/(?:Aplicação|Aplicacao)[:\s]*([^\n]+)/i) || [null, ''])[1];
            const estoque = (estoqueTexto.match(/[0-9]+/) || ['0'])[0];
            const linkNode = el.querySelector('a[href]');
            const link = linkNode ? linkNode.href : '';

            return {
                nome,
                preco,
                codigo,
                marca,
                aplicacao,
                estoque,
                link,
            };
        }).filter((item) => item.preco);
    }, { selectors, nameSelectors, priceSelectors, stockSelectors });
}

async function extractGeneric(page) {
    return page.evaluate(() => {
        const results = [];
        const elements = Array.from(document.querySelectorAll('tr, .product-card, .produto, .item, article, .card'));

        for (const el of elements) {
            const text = (el.textContent || '').trim();
            const priceMatch = text.match(/R\$\s?[0-9.,]+/);
            if (!priceMatch) continue;

            const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) || '';
            const linkNode = el.querySelector('a[href]');

            results.push({
                nome: firstLine,
                preco: priceMatch[0],
                codigo: (text.match(/(?:Cód(?:igo)?|Cod(?:igo)?|Ref)[:\s]*([A-Za-z0-9.-]+)/i) || [null, ''])[1],
                marca: (text.match(/(?:Marca)[:\s]*([^\n]+)/i) || [null, ''])[1],
                aplicacao: (text.match(/(?:Aplicação|Aplicacao)[:\s]*([^\n]+)/i) || [null, ''])[1],
                estoque: (text.match(/(?:Estoque|Qtd|Disponível|Disponivel)[:\s]*([0-9]+)/i) || [null, '0'])[1],
                link: linkNode ? linkNode.href : '',
            });
        }

        return results;
    });
}

async function isAnySelectorVisible(page, selectors, timeout = 2500) {
    for (const selector of selectors) {
        try {
            const visible = await page.locator(selector).first().isVisible({ timeout }).catch(() => false);
            if (visible) {
                return true;
            }
        } catch (_) {}
    }

    return false;
}

async function ensureLoggedIn(page, loginUrl, supplier, strategy = {}) {
    const successSelectors = buildSelectorList(
        strategy.loginSuccessSelector,
        supplier.searchBarSelector,
        strategy.searchSelector,
        [
            'a:has-text("Sair")',
            'a:has-text("Logout")',
            'button:has-text("Sair")',
            'input[type="search"]',
        ]
    );

    if (await isAnySelectorVisible(page, successSelectors, 3000)) {
        return;
    }

    const passwordVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const currentUrl = safeString(page.url());
    const normalizedLoginUrl = safeString(loginUrl).replace(/\/+$/, '');
    const normalizedCurrentUrl = currentUrl.replace(/\/+$/, '');
    const stillOnLoginPage = currentUrl.includes('login') || normalizedCurrentUrl === normalizedLoginUrl;

    if (passwordVisible && stillOnLoginPage) {
        throw new Error('Falha no login: credenciais recusadas ou bloqueio de modal.');
    }
}

async function resetForNextSearch(page, supplier) {
    const targetUrl = supplier.searchUrl || supplier.url;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
}

async function createContext(browser, supplier) {
    const sessionStatePath = getSessionStatePath(supplier);
    const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        ignoreHTTPSErrors: true,
    };

    if (fs.existsSync(sessionStatePath)) {
        contextOptions.storageState = sessionStatePath;
    }

    const context = await browser.newContext(contextOptions);
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        Object.defineProperty(navigator, 'language', {
            get: () => 'pt-BR',
        });

        Object.defineProperty(navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
        });

        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
        });
    });
    await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'media', 'font'].includes(resourceType)) {
            return route.abort();
        }

        return route.continue();
    });
    return { context, sessionStatePath };
}

async function persistSession(context, supplier, shouldPersist) {
    if (!shouldPersist || !supplier.needsLogin) {
        return;
    }

    const sessionStatePath = getSessionStatePath(supplier);
    await context.storageState({ path: sessionStatePath });
}

async function scrapeProduct(supplier, productName) {
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-zygote',
            '--window-size=1920,1080',
        ],
    });

    const { context } = await createContext(browser, supplier);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(30000);

    try {
        console.error(`[DEBUG] Iniciando scraping para: ${supplier.name}`);
        const strategy = resolveStrategy(supplier.name);

        const loginUrl = supplier.loginUrl || supplier.url;
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        await dismissTransientUi(page);

        let didLoginThisRun = false;

        if (supplier.needsLogin) {
            const alreadyLogged = !(await page.locator('input[type="password"]').first().isVisible().catch(() => false));

            if (!alreadyLogged) {
                const preLoginUrl = page.url();
                await runGenericLogin(page, supplier, strategy);
                didLoginThisRun = true;
                await waitForLoginCompletion(page, preLoginUrl, loginUrl, supplier, strategy);
            } else {
                await dismissTransientUi(page);
                await ensureLoggedIn(page, loginUrl, supplier, strategy);
            }
            await persistSession(context, supplier, didLoginThisRun);
        }

        let queries = buildSearchQueries(productName);
        try {
            const parsed = JSON.parse(productName);
            if (parsed.codigo && parsed.nome) {
                queries = [parsed.codigo, parsed.nome];
            }
        } catch (_) {}

        let finalItems = [];

        for (const query of queries) {
            console.error(`[DEBUG] Buscando por: ${query}`);

            if (supplier.searchUrl) {
                await page.goto(supplier.searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
                await page.waitForTimeout(1000);
            }

            const beforeSearchUrl = page.url();
            await performSearch(page, supplier, query, strategy);
            await waitForPageSettle(
                page,
                buildSelectorList(
                    supplier.itemContainerSelector,
                    supplier.productNameSelector,
                    supplier.priceSelector,
                    strategy.searchSelector,
                    strategy.loginSuccessSelector
                ),
                { timeout: 12000, settleMs: 2000, previousUrl: beforeSearchUrl }
            );
            await dismissTransientUi(page);

            let items = [];
            if (supplier.itemContainerSelector || supplier.productNameSelector || supplier.priceSelector) {
                items = await extractWithConfiguredSelectors(page, supplier);
            }

            if (!items.length) {
                items = await extractGeneric(page);
            }

            finalItems = buildBrowserPayload(items, supplier);

            if (finalItems.length > 0) {
                break;
            }

            console.error(`[DEBUG] Nenhum resultado para "${query}". Tentando próxima query se houver.`);
            await resetForNextSearch(page, supplier);
        }

        if (!finalItems.length) {
            throw new Error('Nenhum produto encontrado.');
        }

        return finalItems;
    } catch (error) {
        await page.screenshot({ path: path.join(__dirname, 'debug_error.png'), fullPage: true }).catch(() => {});
        console.error(`[ERROR] ${error.message}`);
        return {
            provider: supplier.name,
            error: error.message,
        };
    } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct };
