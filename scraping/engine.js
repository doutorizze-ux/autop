const { chromium } = require('playwright');

async function scrapeProduct(supplier, productName) {
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--window-size=1920,1080' // Ajuda a evitar elementos escondidos por responsividade
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'pt-BR'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(40000); 

    try {
        console.error(`[DEBUG] Iniciando scraping para: ${supplier.name} | Produto: ${productName}`);
        
        // --- SELETORES DEFAULT (Múltiplas opções para evitar falhas) ---
        const loginUrl = supplier.loginUrl || supplier.url;
        const userSel = supplier.loginUserSelector || 'input[type="email"], input[name*="user"], input[name*="login"], input[name*="email"], #Login, #usuario';
        const passSel = supplier.loginPassSelector || 'input[type="password"], input[name*="pass"], #Senha, #senha';
        const submitSel = supplier.loginSubmitSelector || 'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login")';
        
        const searchSel = supplier.searchBarSelector || 'input[type="search"], input[placeholder*="busca" i], input[name*="busca"], .search-input';
        
        const containerSel = supplier.itemContainerSelector || '.product-card, .item-produto, .product-item, .prod-item, tr, article';
        const nameSel = supplier.productNameSelector || '.product-name, h2, h3, .name, .title, .descricao';
        const priceSel = supplier.priceSelector || '.price-value, .preco, .price, .valor';

        // 1. NAVEGAÇÃO E LOGIN
        console.error(`[DEBUG] Acessando URL de login: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); // Aguarda scripts iniciais

        if (supplier.needsLogin) {
            console.error(`[DEBUG] Procurando campo de usuário...`);
            
            // Lógica para lidar com modals/inputs escondidos
            try {
                // Tenta esperar o input ficar visível. Se falhar, pode ser um modal fechado.
                await page.waitForSelector(userSel, { state: 'visible', timeout: 10000 });
            } catch (e) {
                console.error(`[DEBUG] Input não visível imediatamente. Procurando botões de 'Login' para abrir modal...`);
                // Tenta clicar em um botão de login/entrar na navbar para abrir modal
                const modalBtn = await page.$('a:has-text("Login"), a:has-text("Entrar"), button:has-text("Entrar")');
                if (modalBtn) {
                    await modalBtn.click({ force: true }).catch(()=>console.error("[DEBUG] Erro ao forçar clique no modal"));
                    await page.waitForTimeout(2000);
                    await page.waitForSelector(userSel, { state: 'visible', timeout: 5000 }).catch(()=>console.error("[DEBUG] Ainda não visível"));
                }
            }

            // Preenche Usuário
            const userLocator = page.locator(userSel).first();
            if (await userLocator.count() > 0) {
                await userLocator.scrollIntoViewIfNeeded();
                await userLocator.fill(supplier.loginCredential.toString(), { force: true });
            } else {
                throw new Error(`Campo de usuário não encontrado na DOM (${userSel})`);
            }

            // Preenche Senha
            const passLocator = page.locator(passSel).first();
            if (await passLocator.count() > 0) {
                await passLocator.fill(supplier.password.toString(), { force: true });
            } else {
                throw new Error(`Campo de senha não encontrado na DOM (${passSel})`);
            }

            // Aguarda botão estar habilitado antes de clicar (resolve "element is not enabled")
            console.error(`[DEBUG] Aguardando botão de submit estar habilitado...`);
            try {
                // Garantir que não estamos pegando um botão genérico, mas o primeiro que match
                const submitLocator = page.locator(submitSel).first();
                await submitLocator.waitFor({ state: 'visible', timeout: 5000 });
                
                // Espera explícita pelo estado enabled no DOM
                await page.waitForFunction((selector) => {
                    const el = document.querySelector(selector);
                    return el && !el.disabled && !el.hasAttribute('disabled');
                }, submitSel, { timeout: 5000 });
                
                await submitLocator.click({ force: true });
            } catch (err) {
                console.error(`[DEBUG] Botão de submit falhou via click normal. Tentando Enter...`);
                await passLocator.press('Enter');
            }

            // Validação estrita de Login
            console.error(`[DEBUG] Aguardando processamento do login...`);
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForTimeout(3000); // Dar tempo pro redirect ou JWT token

            // Verifica se a URL mudou OU se o campo de senha sumiu da tela
            const isLoginStillVisible = await page.isVisible(passSel).catch(()=>false);
            const currentUrl = page.url();
            
            if (currentUrl.includes('login') && isLoginStillVisible) {
                throw new Error("Falha no login: As credenciais foram recusadas ou a tela não avançou.");
            } else {
                console.error(`[DEBUG] Login Validado! URL atual: ${currentUrl}`);
            }
        }

        // 2. BUSCA DO PRODUTO
        console.error(`[DEBUG] Buscando pelo produto: ${productName}`);
        
        try {
            await page.waitForSelector(searchSel, { state: 'visible', timeout: 15000 });
            const searchBar = page.locator(searchSel).first();
            await searchBar.scrollIntoViewIfNeeded();
            
            // Simula digitação humana para disparar eventos de frontend (ex: React onChange)
            await searchBar.fill(''); 
            await searchBar.type(productName, { delay: 50 });
            await page.keyboard.press('Enter');
            console.error(`[DEBUG] Busca disparada.`);
        } catch (err) {
            throw new Error(`Campo de busca não encontrado ou não ficou visível: ${searchSel}`);
        }

        // Aguarda os resultados carregarem REAIS
        console.error(`[DEBUG] Aguardando carregamento da rede...`);
        await page.waitForLoadState('networkidle');
        
        // Espera container
        try {
            await page.waitForSelector(containerSel, { state: 'visible', timeout: 15000 });
        } catch (e) {
            console.error(`[DEBUG] Timeout esperando produtos renderizarem (${containerSel}). Tentando extrair do que tem...`);
        }
        await page.waitForTimeout(3000); // Waits extras para frameworks dinâmicos 

        // 3. EXTRAÇÃO
        console.error(`[DEBUG] Extraindo itens...`);
        const items = await page.evaluate(({ cSel, nSel, pSel }) => {
            const results = [];
            const elements = document.querySelectorAll(cSel);
            
            elements.forEach(el => {
                try {
                    let name = '';
                    const nameEl = el.querySelector(nSel);
                    if (nameEl) {
                        name = nameEl.innerText.trim();
                    } else {
                        // Heurística secundária: pega o primeiro texto legível grande se não tiver seletor
                        const texts = el.innerText.split('\n').map(t => t.trim()).filter(t => t.length > 5);
                        if(texts.length > 0) name = texts[0];
                    }

                    let priceText = '';
                    const priceEl = el.querySelector(pSel);
                    if (priceEl) {
                        priceText = priceEl.innerText.trim();
                    } else {
                        // Busca regex R$ de forma estrita no bloco inteiro
                        const match = el.innerText.match(/R\$\s?([0-9.]+[,.][0-9]{2})/);
                        if (match) priceText = match[0];
                    }

                    if (name && priceText) {
                        const cleanPriceMatch = priceText.match(/R\$\s?([0-9.]+[,.][0-9]{2})/);
                        results.push({
                            name: name.substring(0, 100),
                            price: cleanPriceMatch ? cleanPriceMatch[0] : priceText
                        });
                    }
                } catch (e) {}
            });

            return results.slice(0, 5); 
        }, { cSel: containerSel, nSel: nameSel, pSel: priceSel });

        if (items.length === 0) {
            throw new Error("Nenhum produto encontrado. Verifique se o nome buscado existe ou se o seletor do resultado mudou.");
        }

        console.error(`[DEBUG] Sucesso! ${items.length} itens extraídos.`);

        // Retorno limpo
        return {
            provider: supplier.name,
            items: items
        };

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        return {
            provider: supplier.name,
            error: error.message
        };
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct };
