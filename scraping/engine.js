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

function buildVariantKey(product, application) {
    const normalize = (value) => safeString(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const normalizedProduct = normalize(product);
    const normalizedApplication = normalize(application);
    return [normalizedProduct, normalizedApplication].filter(Boolean).join(' | ');
}

function getSupplierSlug(supplier) {
    return safeString(supplier.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'supplier';
}

function getPersistentProfilePath(supplier) {
    const profileRoots = [
        process.env.SCRAPER_PROFILE_ROOT,
        path.join(__dirname, '../local-agent/browser-profiles'),
        path.join(__dirname, '../backend/data/browser-profiles'),
    ].filter(Boolean);

    for (const profileRoot of profileRoots) {
        const profilePath = path.join(profileRoot, getSupplierSlug(supplier));
        if (fs.existsSync(profilePath)) {
            return profilePath;
        }
    }

    return null;
}

function normalizeCookie(cookie) {
    if (!cookie || !cookie.name || cookie.value === undefined) {
        return null;
    }

    const pathValue = String(cookie.path || '/');
    const secureValue = Boolean(cookie.secure);
    const rawDomainValue = String(cookie.domain || '');

    const normalized = {
        name: String(cookie.name),
        value: String(cookie.value),
        httpOnly: Boolean(cookie.httpOnly),
        secure: secureValue,
    };

    if (rawDomainValue) {
        normalized.domain = rawDomainValue;
        normalized.path = pathValue;
    } else if (cookie.url) {
        normalized.url = String(cookie.url);
    } else {
        console.error(`[WARN] Cookie ignorado por falta de domain/url: ${cookie.name}`);
        return null;
    }

    if (cookie.expires !== undefined && cookie.expires !== null) {
        normalized.expires = Number(cookie.expires);
    } else if (cookie.expirationDate !== undefined && cookie.expirationDate !== null) {
        normalized.expires = Number(cookie.expirationDate);
    }

    if (cookie.sameSite) {
        const sameSite = String(cookie.sameSite).toLowerCase();
        if (sameSite === 'lax') normalized.sameSite = 'Lax';
        if (sameSite === 'strict') normalized.sameSite = 'Strict';
        if (sameSite === 'none' || sameSite === 'no_restriction') normalized.sameSite = 'None';
    }

    return normalized;
}

function parseSupplierSessionData(supplier) {
    const raw = safeString(supplier.sessionData);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            const cookies = parsed.map(normalizeCookie).filter(Boolean);
            return cookies.length ? { cookies, origins: [], cookieCount: cookies.length } : null;
        }

        if (parsed && Array.isArray(parsed.cookies)) {
            return {
                cookies: parsed.cookies.map(normalizeCookie).filter(Boolean),
                origins: Array.isArray(parsed.origins) ? parsed.origins : [],
                cookieCount: Array.isArray(parsed.cookies) ? parsed.cookies.length : 0,
            };
        }
    } catch (error) {
        console.error(`[WARN] sessionData invalido para ${supplier.name}: ${error.message}`);
    }

    return null;
}

async function waitForAnyVisible(page, selectors, timeout = 8000) {
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
    const stringValue = safeString(value);
    await locator.click({ force: true }).catch(() => {});
    await locator.press('Control+A').catch(() => {});
    await locator.fill('');
    try {
        await locator.type(stringValue, { delay: 35 });
    } catch (_) {
        await locator.fill(stringValue, { force: true });
    }
    await locator.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }).catch(() => {});
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
    const settleMs = options.settleMs ?? 500;
    const previousUrl = safeString(options.previousUrl || page.url());
    const waiters = [];

    if (previousUrl) {
        waiters.push(
            page.waitForURL((url) => {
                const current = url.toString();
                return current !== previousUrl && !current.includes(previousUrl) && !previousUrl.includes(current);
            }, { timeout }).catch(() => null)
        );
    }

    for (const selector of selectors) {
        try {
            waiters.push(page.locator(selector).first().waitFor({ state: 'attached', timeout }).catch(() => null));
        } catch (_) {}
    }

    await Promise.race(waiters).catch(() => null);
    await page.waitForTimeout(settleMs);
}


async function waitForLoginCompletion(page, previousUrl, loginUrl, supplier, strategy = {}, options = {}) {
    const explicitSuccessSelectors = buildSelectorList(strategy.loginSuccessSelector);
    const successSelectors = explicitSuccessSelectors.length
        ? explicitSuccessSelectors
        : buildSelectorList(supplier.searchBarSelector, strategy.searchSelector);

    await waitForPageSettle(page, successSelectors, {
        timeout: strategy.loginSettleTimeout ?? 8000,
        settleMs: strategy.loginSettleDelay ?? 2500,
        previousUrl,
    });

    await dismissTransientUi(page);
    await ensureLoggedIn(page, loginUrl, supplier, strategy, options);
}

function buildSearchQueries(productName) {
    const baseQuery = safeString(productName);
    const queries = [baseQuery];
    const wildcardQuery = baseQuery.replace(/\s+/g, '%');
    if (wildcardQuery && wildcardQuery !== baseQuery && !queries.includes(wildcardQuery)) {
        queries.push(wildcardQuery);
    }
    const tokens = baseQuery
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    for (const token of tokens) {
        if (!queries.includes(token)) {
            queries.push(token);
        }
    }

    return queries.slice(0, 2);
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
    if (strategy.performSearch) {
        await strategy.performSearch({
            page,
            supplier,
            query,
            fillVisibleLocator,
            dismissTransientUi: () => dismissTransientUi(page),
        });
        return;
    }

    if (strategy.buildSearchUrl) {
        const directUrl = strategy.buildSearchUrl(query, supplier);
        if (directUrl) {
            await page.goto(directUrl, { waitUntil: 'networkidle' }).catch(() => {});
            return;
        }
    }

    const preferStrategySelectors = Boolean(strategy.preferStrategySelectors);
    const searchSelectors = buildSelectorList(
        preferStrategySelectors ? strategy.searchSelector : supplier.searchBarSelector,
        preferStrategySelectors ? supplier.searchBarSelector : strategy.searchSelector,
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
        preferStrategySelectors ? strategy.searchButtonSelector : supplier.searchBtnSelector,
        preferStrategySelectors ? supplier.searchBtnSelector : strategy.searchButtonSelector,
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

    if (strategy.submitSearchWithEnter) {
        await input.press('Enter');
        return;
    }

    try {
        await clickFirstVisible(page, searchButtonSelectors, { timeout: 3000 });
    } catch (_) {
        await input.press('Enter');
    }
}

function buildBrowserPayload(items, supplier) {
    const mappedItems = items.map((item) => ({
        provider: safeString(item.provider || supplier.name),
        product: safeString(item.nome || item.name || item.product),
        price: parsePrice(item.preco || item.price),
        available: true,
        link: safeString(item.link || supplier.url),
        code: safeString(item.codigo || item.code),
        brand: safeString(item.marca || item.brand),
        application: safeString(item.aplicacao || item.application),
        stock: parseInt(item.estoque || item.stock || 0, 10) || 0,
        stockText: safeString(item.estoqueTexto || item.stockText),
        variantKey: buildVariantKey(item.nome || item.name || item.product, item.aplicacao || item.application),
    })).filter((item) => item.price > 0);

    const uniqueItems = [];
    const seen = new Set();

    for (const item of mappedItems) {
        const dedupeKey = [
            item.provider,
            item.product,
            item.code,
            item.price,
            item.stock,
            item.link,
        ].join('|');

        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        uniqueItems.push(item);
    }

    return uniqueItems;
}

function hasVisibleItemsWithoutPrice(items) {
    if (!Array.isArray(items) || !items.length) {
        return false;
    }

    return items.some((item) => safeString(item?.nome || item?.name || item?.product))
        && items.every((item) => parsePrice(item?.preco || item?.price) <= 0);
}

async function extractWithConfiguredSelectors(page, supplier, strategy = {}) {
    const preferStrategySelectors = Boolean(strategy.preferStrategySelectors);
    const selectors = buildSelectorList(
        preferStrategySelectors ? strategy.itemContainerSelector : supplier.itemContainerSelector,
        preferStrategySelectors ? supplier.itemContainerSelector : strategy.itemContainerSelector,
        ['.product-card', '.produto', '.item', 'article', 'tr']
    );
    const nameSelectors = buildSelectorList(
        preferStrategySelectors ? strategy.productNameSelector : supplier.productNameSelector,
        preferStrategySelectors ? supplier.productNameSelector : strategy.productNameSelector,
        ['.name', '.nome', '.title', '.titulo', 'h2', 'h3', 'td']
    );
    const priceSelectors = buildSelectorList(
        preferStrategySelectors ? strategy.priceSelector : supplier.priceSelector,
        preferStrategySelectors ? supplier.priceSelector : strategy.priceSelector,
        ['.price', '.preco', '.valor', '[class*="price"]', '[class*="preco"]', '[class*="valor"]']
    );
    const stockSelectors = buildSelectorList(
        preferStrategySelectors ? strategy.availableSelector : supplier.availableSelector,
        preferStrategySelectors ? supplier.availableSelector : strategy.availableSelector,
        ['.stock', '.estoque', '.available', '.disponivel']
    );
    const codeSelectors = buildSelectorList(strategy.codeSelector);
    const brandSelectors = buildSelectorList(strategy.brandSelector);

    return page.evaluate(({ selectors, nameSelectors, priceSelectors, stockSelectors, codeSelectors, brandSelectors }) => {
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
                codigo: tryText(el, codeSelectors) || codigo,
                marca: tryText(el, brandSelectors) || marca,
                aplicacao,
                estoque,
                link,
            };
        }).filter((item) => item.preco);
    }, { selectors, nameSelectors, priceSelectors, stockSelectors, codeSelectors, brandSelectors });
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

function resolveAuthenticatedUrl(strategy = {}, supplier, loginUrl) {
    if (typeof strategy.authenticatedUrl === 'function') {
        return safeString(strategy.authenticatedUrl(supplier, loginUrl));
    }

    return safeString(strategy.authenticatedUrl || supplier.searchUrl || supplier.url || loginUrl);
}

async function ensureLoggedIn(page, loginUrl, supplier, strategy = {}, options = {}) {
    const explicitSuccessSelectors = buildSelectorList(strategy.loginSuccessSelector);
    const fallbackSuccessSelectors = buildSelectorList(
        supplier.searchBarSelector,
        strategy.searchSelector,
        [
            'a:has-text("Sair")',
            'a:has-text("Logout")',
            'button:has-text("Sair")',
            'input[type="search"]',
        ]
    );
    const successSelectors = explicitSuccessSelectors.length ? explicitSuccessSelectors : fallbackSuccessSelectors;

    if (await isAnySelectorVisible(page, successSelectors, 3000)) {
        return;
    }

    const passwordVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const currentUrl = safeString(page.url());
    const normalizedLoginUrl = safeString(loginUrl).replace(/\/+$/, '');
    const normalizedCurrentUrl = currentUrl.replace(/\/+$/, '');
    const stillOnLoginPage = currentUrl.includes('login') || normalizedCurrentUrl === normalizedLoginUrl;

    if (passwordVisible && stillOnLoginPage) {
        if (safeString(supplier.sessionData) && !options.ignoreSessionDataHint) {
            throw new Error('Sessao manual invalida ou expirada. Gere novos cookies na area ja autenticada do portal.');
        }

        throw new Error('Falha no login: credenciais recusadas ou bloqueio de modal.');
    }
}

async function resetForNextSearch(page, supplier) {
    const targetUrl = supplier.searchUrl || supplier.url;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
}

async function createContext(browser, supplier, strategy = {}) {
    const sessionStatePath = getSessionStatePath(supplier);
    const supplierSessionState = parseSupplierSessionData(supplier);
    const profilePath = getPersistentProfilePath(supplier);
    const preferSessionDataOverProfile = Boolean(strategy.preferSessionDataOverProfile);
    const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        ignoreHTTPSErrors: true,
        proxy: process.env.SCRAPER_PROXY ? { server: process.env.SCRAPER_PROXY } : undefined,
        extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }
    };

    const selectedProfilePath = (profilePath && !preferSessionDataOverProfile) ? profilePath : null;
    const selectedSessionState = supplierSessionState || null;
    const fallbackProfilePath = (profilePath && preferSessionDataOverProfile && !selectedSessionState) ? profilePath : null;

    if (selectedProfilePath) {
        console.error(`[DEBUG] Reutilizando perfil persistente para: ${supplier.name}`);
    } else if (selectedSessionState) {
        console.error(`[DEBUG] Reutilizando sessionData para: ${supplier.name} (${supplierSessionState.cookieCount || 0} cookies)`);
        contextOptions.storageState = {
            cookies: selectedSessionState.cookies || [],
            origins: selectedSessionState.origins || [],
        };
    } else if (fallbackProfilePath) {
        console.error(`[DEBUG] Reutilizando perfil persistente para: ${supplier.name}`);
    } else if (fs.existsSync(sessionStatePath)) {
        console.error(`[DEBUG] Reutilizando sessao salva em arquivo para: ${supplier.name}`);
        contextOptions.storageState = sessionStatePath;
    }

    let context;
    const effectiveProfilePath = selectedProfilePath || fallbackProfilePath;
    if (effectiveProfilePath) {
        try {
            context = await chromium.launchPersistentContext(effectiveProfilePath, {
                ...contextOptions,
                channel: 'chrome',
                ignoreDefaultArgs: ['--enable-automation'],
            });
        } catch (error) {
            console.error(`[DEBUG] Chrome real indisponivel para ${supplier.name}, usando Chromium: ${error.message}`);
            context = await chromium.launchPersistentContext(effectiveProfilePath, contextOptions);
        }
    } else {
        context = await browser.newContext(contextOptions);
    }
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // Evasão profunda para CloudFront
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };

        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
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
        if (['media'].includes(resourceType)) {
            return route.abort();
        }

        return route.continue();
    });
    return {
        context,
        sessionStatePath,
        hasPreloadedSession: Boolean(effectiveProfilePath || selectedSessionState || fs.existsSync(sessionStatePath)),
    };
}

async function persistSession(context, supplier, shouldPersist) {
    if (!shouldPersist || !supplier.needsLogin) {
        return;
    }

    const sessionStatePath = getSessionStatePath(supplier);
    await context.storageState({ path: sessionStatePath });
}

async function captureDebugState(page) {
    const finalUrl = safeString(page.url());
    const pageTitle = safeString(await page.title().catch(() => ''));
    const bodyText = safeString(
        await page.locator('body').innerText().catch(() => '')
    ).replace(/\s+/g, ' ');

    return {
        finalUrl,
        pageTitle,
        bodySnippet: bodyText.slice(0, 1000),
    };
}

let globalBrowserPromise = null;

function getBrowser() {
    if (!globalBrowserPromise) {
        console.error("[Playwright] Inicializando Browser Global pela primeira vez...");
        globalBrowserPromise = (async () => {
            const launchOptions = {
                headless: process.env.HEADLESS !== 'false',
                ignoreDefaultArgs: ['--enable-automation'],
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--no-first-run',
                    '--no-zygote',
                    '--window-size=1920,1080',
                ],
            };

            try {
                return await chromium.launch({
                    ...launchOptions,
                    channel: 'chrome',
                });
            } catch (error) {
                console.error(`[Playwright] Chrome real indisponivel, usando Chromium: ${error.message}`);
                return chromium.launch(launchOptions);
            }
        })();
    }
    return globalBrowserPromise;
}

async function scrapeProduct(supplier, productName) {
    const browser = await getBrowser();
    const strategy = resolveStrategy(supplier);

    const { context, hasPreloadedSession } = await createContext(browser, supplier, strategy);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    try {
        console.error(`[DEBUG] Iniciando scraping para: ${supplier.name}`);

        if (typeof strategy.preparePage === 'function') {
            await strategy.preparePage({ page, supplier, productName, context }).catch((error) => {
                console.error(`[WARN] Falha ao preparar pagina para ${supplier.name}: ${error.message}`);
            });
        }

        const loginUrl = supplier.loginUrl || supplier.url;
        const initialUrl = hasPreloadedSession
            ? resolveAuthenticatedUrl(strategy, supplier, loginUrl)
            : loginUrl;

        await page.goto(initialUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        await dismissTransientUi(page);

        let didLoginThisRun = false;

        if (supplier.needsLogin) {
            const alreadyLogged = await isAnySelectorVisible(
                page,
                buildSelectorList(
                    strategy.loginSuccessSelector,
                    supplier.searchBarSelector,
                    strategy.searchSelector
                ),
                3000
            );

            if (!alreadyLogged) {
                if (hasPreloadedSession) {
                    console.error(`[WARN] Sessao pre-carregada nao autenticou ${supplier.name}. Tentando login automatico como fallback.`);
                    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
                    await page.waitForTimeout(1500);
                    await dismissTransientUi(page);
                }

                const preLoginUrl = page.url();
                await runGenericLogin(page, supplier, strategy);
                didLoginThisRun = true;
                await waitForLoginCompletion(page, preLoginUrl, loginUrl, supplier, strategy, {
                    ignoreSessionDataHint: hasPreloadedSession,
                });
            } else {
                await dismissTransientUi(page);
                await ensureLoggedIn(page, loginUrl, supplier, strategy);
            }
            await persistSession(context, supplier, didLoginThisRun);
        }

        const authenticatedTargetUrl = resolveAuthenticatedUrl(strategy, supplier, loginUrl);
        const normalizedAuthenticatedTarget = safeString(authenticatedTargetUrl).replace(/\/+$/, '');
        const normalizedCurrentUrl = safeString(page.url()).replace(/\/+$/, '');
        const searchReadySelectors = buildSelectorList(strategy.searchSelector, supplier.searchBarSelector);
        const searchReady = searchReadySelectors.length
            ? await isAnySelectorVisible(page, searchReadySelectors, 1500)
            : false;

        if (
            supplier.needsLogin
            && normalizedAuthenticatedTarget
            && (
                strategy.navigateToAuthenticatedAfterLogin
                || !searchReady
            )
            && normalizedCurrentUrl !== normalizedAuthenticatedTarget
        ) {
            await page.goto(authenticatedTargetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await waitForPageSettle(
                page,
                buildSelectorList(
                    strategy.searchSelector,
                    supplier.searchBarSelector,
                    strategy.itemContainerSelector,
                    strategy.loginSuccessSelector
                ),
                { timeout: 12000, settleMs: 1500, previousUrl: normalizedCurrentUrl }
            );
            await dismissTransientUi(page);
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
                await page.waitForTimeout(200);
            }

            const beforeSearchUrl = page.url();
            await performSearch(page, supplier, query, strategy);
            const postSearchSelectors = strategy.waitForResultsOnly
                ? buildSelectorList(
                    strategy.preferStrategySelectors ? strategy.itemContainerSelector : supplier.itemContainerSelector,
                    strategy.preferStrategySelectors ? strategy.productNameSelector : supplier.productNameSelector,
                    strategy.preferStrategySelectors ? strategy.priceSelector : supplier.priceSelector,
                    strategy.preferStrategySelectors ? supplier.itemContainerSelector : strategy.itemContainerSelector,
                    strategy.preferStrategySelectors ? supplier.productNameSelector : strategy.productNameSelector,
                    strategy.preferStrategySelectors ? supplier.priceSelector : strategy.priceSelector,
                    strategy.emptyResultSelector
                )
                : buildSelectorList(
                    strategy.preferStrategySelectors ? strategy.itemContainerSelector : supplier.itemContainerSelector,
                    strategy.preferStrategySelectors ? strategy.productNameSelector : supplier.productNameSelector,
                    strategy.preferStrategySelectors ? strategy.priceSelector : supplier.priceSelector,
                    strategy.preferStrategySelectors ? supplier.itemContainerSelector : strategy.itemContainerSelector,
                    strategy.preferStrategySelectors ? supplier.productNameSelector : strategy.productNameSelector,
                    strategy.preferStrategySelectors ? supplier.priceSelector : strategy.priceSelector,
                    strategy.searchSelector,
                    strategy.loginSuccessSelector,
                    supplier.searchBarSelector
                );

            await waitForPageSettle(
                page,
                postSearchSelectors,
                { timeout: 12000, settleMs: 500, previousUrl: beforeSearchUrl }
            );
            await dismissTransientUi(page);

            let items = [];
            if (strategy.extractItems) {
                items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
            }

            if (
                supplier.itemContainerSelector || supplier.productNameSelector || supplier.priceSelector
                || strategy.itemContainerSelector || strategy.productNameSelector || strategy.priceSelector
            ) {
                items = items.length ? items : await extractWithConfiguredSelectors(page, supplier, strategy);
            }

            if (!items.length) {
                items = await extractGeneric(page);
            }

            finalItems = buildBrowserPayload(items, supplier);

            if (!finalItems.length && hasVisibleItemsWithoutPrice(items)) {
                throw new Error('Produto localizado, mas o portal nao exibiu preco. Sessao/login pode estar invalido para este fornecedor.');
            }

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
        const debug = await captureDebugState(page).catch(() => ({
            finalUrl: safeString(page.url()),
            pageTitle: '',
            bodySnippet: '',
        }));
        let errorMessage = error.message;

        if (
            supplier.needsLogin &&
            errorMessage.includes('Falha no login') &&
            !safeString(supplier.sessionData)
        ) {
            errorMessage = `${errorMessage} Dica: preencha "Sessao/Cookies JSON" no cadastro do fornecedor para reutilizar uma sessao autenticada.`;
        } else if (
            supplier.needsLogin &&
            errorMessage.includes('Falha no login') &&
            safeString(supplier.sessionData)
        ) {
            errorMessage = `${errorMessage} A sessao manual tambem nao foi suficiente ou expirou.`;
        }

        console.error(`[ERROR] ${errorMessage}`);
        if (debug.finalUrl || debug.pageTitle || debug.bodySnippet) {
            console.error(`[DEBUG PAGE] url=${debug.finalUrl} title=${debug.pageTitle} snippet=${debug.bodySnippet}`);
        }
        return {
            provider: supplier.name,
            error: errorMessage,
            debug,
        };
    } finally {
        await context.close().catch(() => {});
        // O browser.close() foi removido para manter a instancia global viva
    }
}

module.exports = { scrapeProduct };
