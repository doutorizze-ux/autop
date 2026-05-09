const fs = require('fs');
const path = require('path');
const https = require('https');

let cachedBootstrapState = null;

function extractAsciiChunks(buffer) {
    const chunks = [];
    let start = -1;
    const allowed = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:/@-'.split(''));

    for (let index = 0; index < buffer.length; index += 1) {
        const char = String.fromCharCode(buffer[index]);
        if (allowed.has(char)) {
            if (start === -1) {
                start = index;
            }
            continue;
        }

        if (start !== -1) {
            if (index - start >= 4) {
                chunks.push({
                    pos: start,
                    text: buffer.slice(start, index).toString('ascii'),
                });
            }
            start = -1;
        }
    }

    return chunks;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let body = '';
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if (response.statusCode && response.statusCode >= 400) {
                    reject(new Error(`HTTP ${response.statusCode} ao buscar ${url}`));
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

async function readBootstrapStateFromChrome() {
    if (cachedBootstrapState !== null) {
        return cachedBootstrapState;
    }

    const levelDbFile = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb', '022421.ldb')
        : '';

    if (!levelDbFile || !fs.existsSync(levelDbFile)) {
        cachedBootstrapState = null;
        return null;
    }

    const chunks = extractAsciiChunks(fs.readFileSync(levelDbFile));
    const originIndex = chunks.findIndex((entry) => entry.text.includes('_https://catalogoonline.kaizenautopecas.com.br'));
    if (originIndex === -1) {
        cachedBootstrapState = null;
        return null;
    }

    const refreshIndex = chunks.findIndex((entry, index) => index > originIndex && entry.text === 'eycloak_refresh_token');
    const tokenIndex = chunks.findIndex((entry, index) => index > refreshIndex && entry.text === 'token');
    const labelsIndex = chunks.findIndex((entry, index) => index > tokenIndex && entry.text === 'labels');

    const refreshToken = (refreshIndex !== -1 && tokenIndex !== -1)
        ? chunks.slice(refreshIndex + 1, tokenIndex).map((entry) => entry.text).join('')
        : '';
    const accessToken = (tokenIndex !== -1 && labelsIndex !== -1)
        ? chunks.slice(tokenIndex + 1, labelsIndex).map((entry) => entry.text).join('')
        : '';

    const catalog = await fetchJson('https://bff.catalogofraga.com.br/gateway/api/v1/catalog/url/https%3A%2F%2Fcatalogoonline.kaizenautopecas.com.br').catch(() => null);
    if (!catalog) {
        cachedBootstrapState = null;
        return null;
    }

    cachedBootstrapState = {
        catalogData: {
            catalog_id: catalog.id,
            realm: catalog.realm,
            authenticated: catalog.authenticated,
            fullPlateAcess: catalog.fullPlateAcess,
            name: catalog.name,
            site: catalog.site,
            cms: catalog.cms,
            quotation: catalog.quotation,
            typeId: catalog.typeId,
            email: catalog.email,
            vehicleCharacteristics: catalog.vehicleCharacteristics,
            roleId: catalog.roleId,
            viewAllProducts: catalog.viewAllProducts,
        },
        keycloakToken: accessToken,
        keycloakRefreshToken: refreshToken,
    };

    return cachedBootstrapState;
}

module.exports = {
    key: 'kaizen',
    matches: (supplierName) => supplierName.includes('kaizen'),
    authenticatedUrl: 'https://catalogoonline.kaizenautopecas.com.br',
    preferSessionDataOverProfile: true,
    preparePage: async ({ page }) => {
        const state = await readBootstrapStateFromChrome();
        if (!state) {
            return;
        }

        await page.addInitScript((payload) => {
            try {
                localStorage.setItem('catalog_data', JSON.stringify(payload.catalogData));

                if (payload.keycloakToken) {
                    localStorage.setItem('keycloak_token', payload.keycloakToken);
                }

                if (payload.keycloakRefreshToken) {
                    localStorage.setItem('keycloak_refresh_token', payload.keycloakRefreshToken);
                }
            } catch (_) {}
        }, state);
    },
    userSelector: ['input[name*="cnpj" i]', 'input[placeholder*="cnpj" i]', 'input[name*="login" i]', 'input[type="text"]'],
    passSelector: ['input[type="password"]', 'input[name*="senha" i]', 'input[placeholder*="senha" i]'],
    submitSelector: ['button:has-text("Entrar")', 'button[type="submit"]'],
    loginSuccessSelector: [
        'button:has-text("Busca por Codigo")',
        'button:has-text("Busca por Código")',
        'button:has-text("Busca por Veiculo")',
        'button:has-text("Busca por Veículo")',
        'input[name="searchCodeInput"]',
        'input[list="topProdutos"]',
        'input[placeholder*="LB55" i]',
    ],
    searchSelector: [
        'input[name="searchCodeInput"]',
        'input[list="topProdutos"]',
        'input[placeholder*="LB55" i]',
        'input[placeholder*="W0120" i]',
        'input[placeholder*="codigo" i]',
        'input[placeholder*="código" i]',
        'input[placeholder*="descricao" i]',
        'input[placeholder*="descrição" i]',
    ],
    searchButtonSelector: [
        'button[aria-label="Pesquisar"]',
        'button[title="Pesquisar"]',
        'button:has(svg)',
        'button:has(.fa-search)',
        'button[type="submit"]',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,
    emptyResultSelector: ['text=Sem resultados ainda', 'text=Sem resultados', 'text=Nenhum resultado'],
    itemContainerSelector: ['[class*="product"]', '[class*="Product"]', '.card', '.product-block', '.item'],
    productNameSelector: ['h2', 'h3', '.nome', '.descricao', '[class*="name"]', '[class*="Name"]', '[class*="description"]', '[class*="Description"]'],
    priceSelector: ['.preco', '.valor', '[class*="preco"]', '[class*="valor"]', '[class*="price"]', '[class*="Price"]'],
    extractItems: async ({ page, supplier }) => {
        const products = await page.evaluate((supplierName) => {
            const safeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const toAbsoluteUrl = (href) => {
                if (!href) return '';
                try {
                    return new URL(href, window.location.origin).toString();
                } catch {
                    return href;
                }
            };

            const cards = Array.from(document.querySelectorAll('div[class*="_products_"]'));
            const items = [];

            for (const card of cards) {
                const productName = safeText(card.querySelector('h1')?.textContent);
                const application = safeText(card.querySelector('p strong')?.parentElement?.textContent)
                    .replace(/^Obs:\s*/i, '');

                const rows = Array.from(card.querySelectorAll('tbody tr[class*="_origLine_"]'));
                for (const row of rows) {
                    const brand = safeText(row.querySelector('p[class*="_marca_"]')?.textContent);
                    const code = safeText(row.querySelector('td:nth-child(2) a span')?.textContent);
                    const priceText = safeText(row.querySelector('span#price, span[class*="_similar_"]')?.textContent);
                    const stockText = safeText(row.querySelector('p[class*="_stockRange_"]')?.textContent);
                    const link = toAbsoluteUrl(row.querySelector('td:nth-child(2) a')?.getAttribute('href'));

                    if (!productName || !priceText) continue;

                    items.push({
                        provider: supplierName,
                        nome: productName,
                        preco: priceText,
                        codigo: code,
                        marca: brand,
                        aplicacao: application,
                        estoque: (stockText.match(/\d+/) || ['0'])[0],
                        estoqueTexto: stockText,
                        link,
                    });
                }
            }

            return items;
        }, supplier.name);

        return products;
    },

    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const codeTab = page.locator('button:has-text("Busca por Codigo"), button:has-text("Busca por Código")').first();
        if (await codeTab.isVisible().catch(() => false)) {
            await codeTab.click({ force: true }).catch(() => {});
        }

        const input = page.locator('input[name="searchCodeInput"], input[list="topProdutos"], input[placeholder*="LB55" i], input[placeholder*="W0120" i]').first();
        await input.waitFor({ state: 'visible', timeout: 15000 });
        await fillVisibleLocator(input, query);

        const submit = page.locator('button[aria-label="Pesquisar"], button[title="Pesquisar"], button[type="submit"]').first();
        if (await submit.isVisible().catch(() => false)) {
            await submit.click({ force: true }).catch(() => {});
        } else {
            await input.press('Enter').catch(() => {});
        }
    },

    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const loginValue = supplier.loginCredential || supplier.loginExtraValue || '';
        if (!loginValue) {
            throw new Error('Fornecedor sem CNPJ/login configurado.');
        }

        const userInput = page.locator('input[name*="cnpj" i], input[placeholder*="cnpj" i], input[name*="login" i], input[type="text"]').first();
        if (await userInput.isVisible().catch(() => false)) {
            await fillVisibleLocator(userInput, loginValue);
        }

        let passwordInput = page.locator('input[type="password"], input[name*="senha" i], input[placeholder*="senha" i]').first();
        if (!await passwordInput.isVisible().catch(() => false)) {
            const nextButton = page.locator('button:has-text("Entrar"), button[type="submit"]').first();
            if (await nextButton.isVisible().catch(() => false)) {
                await nextButton.click({ force: true }).catch(() => {});
                await page.waitForTimeout(1000);
            }
            passwordInput = page.locator('input[type="password"], input[name*="senha" i], input[placeholder*="senha" i]').first();
        }

        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
        await fillVisibleLocator(passwordInput, supplier.password || '');

        const submitButton = page.locator('button:has-text("Entrar"), button[type="submit"]').first();
        const buttonDisabled = await submitButton.isDisabled().catch(() => false);
        const hasTurnstileField = await page.locator('input[name="cf-turnstile-response"]').first().count().catch(() => 0);
        if (buttonDisabled && hasTurnstileField) {
            throw new Error('Sessao do Kaizen expirou e o portal exige desafio de seguranca. Use o Login Assistido, conclua o desafio no navegador e salve a sessao.');
        }
    },
};
