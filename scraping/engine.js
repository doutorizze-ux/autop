const { chromium } = require('playwright');

async function scrapeProduct(supplier, productName) {
    // Configurações focadas em Linux / Docker / Coolify
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
            '--single-process'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    page.setDefaultTimeout(35000); // Timeout de 35s por ação para não travar o server

    try {
        console.error(`[DEBUG] Iniciando scraping para: ${supplier.name} | Produto: ${productName}`);
        
        // --- SELETORES DEFAULT (Foco no Comdip e Padrões Reais) ---
        const isComdip = supplier.name.toLowerCase().includes('comdip');
        
        const loginUrl = supplier.loginUrl || supplier.url;
        const userSel = supplier.loginUserSelector || (isComdip ? 'input#Login' : 'input[name="email"], input[name="login"], input[type="text"]');
        const passSel = supplier.loginPassSelector || (isComdip ? 'input#Senha' : 'input[name="senha"], input[type="password"]');
        const submitSel = supplier.loginSubmitSelector || (isComdip ? 'button:has-text("Entrar")' : 'button[type="submit"], input[type="submit"], button:has-text("Entrar")');
        
        const searchSel = supplier.searchBarSelector || (isComdip ? 'input.search-input, input[placeholder*="busca" i]' : 'input[type="search"], input[placeholder*="busca" i], input[name*="busca"]');
        
        const containerSel = supplier.itemContainerSelector || (isComdip ? '.product-card, .item-produto' : '.product-item, .prod-item, tr, .item, .product-card');
        const nameSel = supplier.productNameSelector || (isComdip ? '.product-name, h2' : 'h2, h3, .name, .title, .descricao');
        const priceSel = supplier.priceSelector || (isComdip ? '.price-value, .preco' : '.price, .valor, .preco, span:has-text("R$")');

        // 1. NAVEGAÇÃO E LOGIN
        console.error(`[DEBUG] Acessando URL de login: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'load' });

        if (supplier.needsLogin) {
            console.error(`[DEBUG] Preenchendo credenciais...`);
            
            // Preenche Usuário
            await page.waitForSelector(userSel, { state: 'visible' }).catch(() => console.error(`[DEBUG] Seletor de usuário não achado: ${userSel}`));
            const userInputs = await page.$$(userSel);
            if(userInputs.length > 0) {
                await userInputs[0].fill(supplier.loginCredential.toString());
            } else {
                throw new Error(`Campo de usuário não encontrado (${userSel})`);
            }

            // Preenche Senha
            const passInputs = await page.$$(passSel);
            if(passInputs.length > 0) {
                await passInputs[0].fill(supplier.password.toString());
            } else {
                throw new Error(`Campo de senha não encontrado (${passSel})`);
            }

            // Clica Entrar
            console.error(`[DEBUG] Clicando em Entrar...`);
            const btnInputs = await page.$$(submitSel);
            if(btnInputs.length > 0) {
                await btnInputs[0].click();
            } else {
                await page.keyboard.press('Enter');
            }

            // Aguarda a rede acalmar após o login
            console.error(`[DEBUG] Aguardando redirecionamento de login...`);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000); // Wait extra para garantir renderização JS

            // Validação de Login: Se a URL continuou a mesma e tem erro de senha, ou se um botão sair apareceu
            if (page.url().includes('login') || page.url() === loginUrl) {
                console.error(`[DEBUG] Aviso: URL não mudou após login. Pode ser um modal ou falha.`);
            } else {
                console.error(`[DEBUG] Login aparentemente bem-sucedido. URL atual: ${page.url()}`);
            }
        }

        // 2. BUSCA DO PRODUTO
        console.error(`[DEBUG] Buscando pelo produto: ${productName}`);
        
        // Tenta encontrar a barra de busca
        await page.waitForSelector(searchSel, { state: 'visible', timeout: 10000 }).catch(() => console.error(`[DEBUG] Seletor de busca não visível rápido: ${searchSel}`));
        const searchBars = await page.$$(searchSel);
        
        if (searchBars.length > 0) {
            await searchBars[0].fill(productName);
            await page.keyboard.press('Enter');
            console.error(`[DEBUG] Enter pressionado na busca.`);
        } else {
            console.error(`[DEBUG] Tentativa de heurística para achar campo de busca...`);
            const fallbackSearch = await page.$('input[type="text"]');
            if (fallbackSearch) {
                await fallbackSearch.fill(productName);
                await page.keyboard.press('Enter');
            } else {
                throw new Error("Não foi possível encontrar a barra de busca na página.");
            }
        }

        // Aguarda os resultados carregarem
        console.error(`[DEBUG] Aguardando carregamento dos resultados...`);
        await page.waitForLoadState('networkidle');
        
        // Espera pelo container do produto aparecer na tela
        await page.waitForSelector(containerSel, { state: 'visible', timeout: 15000 }).catch(() => {
            console.error(`[DEBUG] Container de produtos (${containerSel}) não apareceu no tempo esperado.`);
        });
        await page.waitForTimeout(2000); // Wait de estabilidade para JS que renderiza preços via API

        // 3. EXTRAÇÃO
        console.error(`[DEBUG] Extraindo itens da tela...`);
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
                        // Fallback pra nome: pega o primeiro texto grande
                        name = el.innerText.split('\n')[0].trim();
                    }

                    let priceText = '';
                    const priceEl = el.querySelector(pSel);
                    if (priceEl) {
                        priceText = priceEl.innerText.trim();
                    } else {
                        // Fallback pra preço: procura R$
                        const text = el.innerText;
                        const match = text.match(/R\$\s?([0-9.]+[,.][0-9]{2})/);
                        if (match) priceText = match[0];
                    }

                    if (name && priceText) {
                        // Filtra o preço final para ser legível (ex: R$ 100,00)
                        const cleanPrice = priceText.match(/R\$\s?([0-9.]+[,.][0-9]{2})/);
                        results.push({
                            name: name.substring(0, 100),
                            price: cleanPrice ? cleanPrice[0] : priceText
                        });
                    }
                } catch (e) {}
            });

            return results.slice(0, 5); // Retorna os 5 primeiros mais relevantes
        }, { cSel: containerSel, nSel: nameSel, pSel: priceSel });

        console.error(`[DEBUG] Encontrados ${items.length} itens.`);

        // Retorna sucesso
        return {
            provider: supplier.name,
            items: items
        };

    } catch (error) {
        console.error(`[ERROR] Falha crítica no scraping: ${error.message}`);
        // Retorna formato de erro
        return {
            provider: supplier.name,
            error: error.message
        };
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct };
