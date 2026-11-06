const { safeString } = require('./shared');

const LOGIN_URL = 'https://portalcomdip.com.br/comdip/catalogo/login';
const AUTH_URL = 'https://portalcomdip.com.br/comdip/compras';

module.exports = {
    key: 'comdip',
    matches: (supplierName) => supplierName.includes('comdip'),
    loginUrl: LOGIN_URL,
    authenticatedUrl: AUTH_URL,
    userSelector: [
        '#mat-input-0',
        'input[placeholder*="cnpj/cpf" i]',
        'input[id^="mat-input-0"]',
        'input[name*="cnpj" i]',
        'input[placeholder*="cnpj" i]',
        'input[placeholder*="email" i]',
    ],
    passSelector: [
        '#mat-input-1',
        'input[placeholder*="senha" i]',
        'input[id^="mat-input-1"]',
        'input[type="password"]',
    ],
    submitSelector: [
        'button.btn-parametro',
        'button:has-text("Entrar")',
        'button:has-text("Login")',
    ],
    loginSuccessSelector: [
        'button:has-text("OFICINA DO")',
        'button:has-text("Meu histórico")',
        'button:has-text("Minhas Listas")',
        'button:has-text("MENU DEPARTAMENTOS")',
        'a:has-text("Sair")',
    ],
    searchSelector: [
        'input[type="search"]',
        'input[placeholder*="nome" i]',
        'input[placeholder*="marca" i]',
        'input[placeholder*="buscar" i]',
        '.search-input',
    ],
    itemContainerSelector: ['isthmus-produto-b2b-card', '.produto-card'],
    emptyResultSelector: [
        'text="0 itens encontrados"',
        'text="Nenhum resultado"',
        'text="Nenhum produto"',
    ],
    preferStrategySelectors: true,
    waitForResultsOnly: true,

    buildSearchUrl: (query) => `https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/${encodeURIComponent(String(query).toLowerCase())}/1`,

    fillLogin: async ({ page, supplier, dismissTransientUi }) => {
        if (dismissTransientUi) {
            await dismissTransientUi().catch(() => {});
        }
        await page.waitForTimeout(1000);

        const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i], input[placeholder*="email" i]').first();
        if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await emailField.click();
            await emailField.fill(supplier.loginCredential || '33.299.637/0001-80');
        }

        const passField = page.locator('#mat-input-1, input[placeholder*="senha" i], input[type="password"]').first();
        if (await passField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await passField.click();
            await passField.fill(supplier.password || 'Re539597@');
        }

        const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
        await consent.check({ force: true }).catch(async () => {
            await consent.click({ force: true }).catch(() => {});
        });
        await page.waitForTimeout(500);
    },

    afterLogin: async ({ page }) => {
        await page.waitForFunction(() => {
            const token = localStorage.getItem('ngx-webstorage|jwttoken:comdip');
            return token && token.length > 20;
        }, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1000);
        if (page.url().includes('login-otp') || (await page.locator('text=Receber código de acesso').first().isVisible().catch(() => false))) {
            throw new Error('Comdip exige código OTP (2FA). Realize o login no portal para atualizar a sessão.');
        }
    },

    performSearch: async ({ page, query, supplier }) => {
        const searchUrl = `https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/${encodeURIComponent(String(query).toLowerCase())}/1`;

        // If on login page, perform quick auto-login
        if (page.url().includes('login')) {
            console.log('[comdip] On login page, performing auto-login...');
            const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i]').first();
            const passField = page.locator('#mat-input-1, input[placeholder*="senha" i]').first();
            if (await emailField.isVisible({ timeout: 4000 }).catch(() => false)) {
                await emailField.fill(supplier.loginCredential || '33.299.637/0001-80');
                await passField.fill(supplier.password || 'Re539597@');
                const consent = page.locator('input[name="cbAceitarTermos"], input[type="checkbox"]').first();
                await consent.check({ force: true }).catch(async () => {
                    await consent.click({ force: true }).catch(() => {});
                });
                await page.waitForTimeout(500);
                const btn = page.locator('button.btn-parametro, button:has-text("Entrar")').first();
                await btn.click({ force: true }).catch(() => {});
                await page.waitForURL((url) => url.href.includes('/compras'), { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(2000);
            }
        } else if (!page.url().includes('/pesquisa/')) {
            // Wait for Angular to hydrate on compras
            await page.locator('button:has-text("OFICINA DO")').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
        }

        if (page.url() !== searchUrl) {
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        await page.waitForTimeout(1500);

        // Wait for results
        await Promise.race([
            page.locator('isthmus-produto-b2b-card, .produto-card').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
            page.locator('text="0 itens encontrados", text="Nenhum resultado"').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => null),
        ]);
        await page.waitForTimeout(1500);
    },

    extractItems: async ({ page, supplier }) => {
        const items = await page.evaluate(() => {
            const cards = document.querySelectorAll('isthmus-produto-b2b-card, .produto-card');
            const results = [];
            const seen = new Set();

            for (const el of cards) {
                const rawText = el.innerText || '';
                const nomeEl = el.querySelector('.card-nome');
                const fullTitle = (nomeEl ? nomeEl.innerText : '').trim();
                if (!fullTitle) continue;

                const priceMatch = rawText.match(/R\$\s?[0-9.,]+/);
                const isIndisponivel = rawText.toLowerCase().includes('indisponível') || rawText.toLowerCase().includes('avise-me');
                if (isIndisponivel || !priceMatch) continue;

                // Match code and description e.g. "W7122 - FILTRO DE OLEO" or "W712/16 - FILTRO"
                const parts = fullTitle.split('-').map((s) => s.trim());
                const codigo = parts[0] || '';
                const preco = priceMatch[0];

                const key = `${codigo}|${preco}`;
                if (seen.has(key)) continue;
                seen.add(key);

                let marca = '';
                if (/MANN/i.test(rawText)) marca = 'MANN-FILTER';
                else if (/WEGA/i.test(rawText)) marca = 'WEGA';
                else if (/FRAM/i.test(rawText)) marca = 'FRAM';
                else if (/TECFIL/i.test(rawText)) marca = 'TECFIL';
                else if (/SEINECA/i.test(rawText)) marca = 'SEINECA';

                results.push({
                    codigo,
                    nome: fullTitle,
                    preco,
                    marca,
                    estoque: 10,
                    estoqueTexto: 'Em estoque',
                    link: window.location.href,
                });
            }
            return results;
        });

        return items.map((item) => ({
            provider: supplier?.name || 'Comdip',
            nome: item.nome,
            preco: item.preco,
            codigo: item.codigo,
            marca: item.marca,
            estoque: item.estoque,
            estoqueTexto: item.estoqueTexto,
            link: item.link || AUTH_URL,
        })).filter((item) => safeString(item.nome) && safeString(item.preco));
    },
};
