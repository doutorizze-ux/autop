const { chromium } = require('playwright');

// Função auxiliar para conversão de preço
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const match = priceStr.match(/([0-9.,]+)/);
    if (!match) return 0;
    let clean = match[1].replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

// Estratégias específicas por fornecedor
const strategies = {
    comdip: {
        login: async (page, supplier) => {
            console.error(`[DEBUG] Login COMDIP (CNPJ + Senha)`);
            const cnpjSel = supplier.loginUserSelector || 'input[name*="cnpj"], input[placeholder*="cnpj" i], #Cnpj, #Login';
            const passSel = supplier.loginPassSelector || 'input[type="password"]';
            const submitSel = supplier.loginSubmitSelector || 'button:has-text("Entrar"), button:has-text("Login")';

            await page.waitForSelector(cnpjSel, { state: 'visible' });
            await page.locator(cnpjSel).first().fill(supplier.loginCredential.toString(), { force: true });
            await page.locator(passSel).first().fill(supplier.password.toString(), { force: true });
            await page.locator(submitSel).first().click({ force: true });
        },
        search: async (page, query) => {
            const searchSel = 'input[type="search"], input[placeholder*="busca" i], .search-input';
            await page.waitForSelector(searchSel, { state: 'visible' });
            await page.locator(searchSel).first().fill(query);
            await page.keyboard.press('Enter');
        },
        extract: async (page) => {
            return await page.evaluate(() => {
                const results = [];
                // Resultados em grade
                document.querySelectorAll('.product-card, .item-produto, .grid-item, article').forEach(el => {
                    const text = el.innerText;
                    if (!text.includes('R$')) return;
                    
                    const name = el.querySelector('.name, .title, h2, h3')?.innerText || text.split('\n')[0];
                    const priceRaw = el.querySelector('.price, .valor, span:contains("R$")')?.innerText || text.match(/R\$\s?([0-9.,]+)/)?.[0];
                    const code = el.querySelector('.code, .codigo, [data-code]')?.innerText || text.match(/(?:Cód|Código|Ref)[:\s]*([a-zA-Z0-9-]+)/i)?.[1] || "";
                    const brand = el.querySelector('.brand, .marca')?.innerText || text.match(/(?:Marca)[:\s]*([a-zA-Z0-9]+)/i)?.[1] || "";

                    if (priceRaw) results.push({ nome: name.trim(), codigo: code.trim(), marca: brand.trim(), preco: priceRaw, estoque: 0 });
                });
                return results;
            });
        }
    },
    kaizen: {
        login: async (page, supplier) => {
            console.error(`[DEBUG] Login KAIZEN (CNPJ + Senha)`);
            const cnpjSel = supplier.loginUserSelector || 'input[name*="cnpj"], input[placeholder*="cnpj" i]';
            const passSel = supplier.loginPassSelector || 'input[type="password"]';
            const submitSel = supplier.loginSubmitSelector || 'button:has-text("Entrar")';

            await page.waitForSelector(cnpjSel, { state: 'visible' });
            await page.locator(cnpjSel).first().fill(supplier.loginCredential.toString());
            await page.locator(passSel).first().fill(supplier.password.toString());
            await page.locator(submitSel).first().click();
        },
        search: async (page, query) => {
            const searchSel = 'input[placeholder*="código" i], input[placeholder*="descrição" i], input[type="text"]';
            await page.waitForSelector(searchSel, { state: 'visible' });
            await page.locator(searchSel).first().fill(query);
            await page.keyboard.press('Enter');
        },
        extract: async (page) => {
            return await page.evaluate(() => {
                const results = [];
                // Resultado em bloco
                document.querySelectorAll('.bloco-produto, .product-block, .item').forEach(el => {
                    const text = el.innerText;
                    if (!text.includes('R$')) return;
                    
                    const name = el.querySelector('.nome, .descricao')?.innerText || text.split('\n')[0];
                    const priceRaw = el.querySelector('.preco, .valor')?.innerText || text.match(/R\$\s?([0-9.,]+)/)?.[0];
                    const code = text.match(/(?:Código|Cód)[:\s]*([a-zA-Z0-9-]+)/i)?.[1] || "";
                    const brand = text.match(/(?:Marca)[:\s]*([a-zA-Z0-9]+)/i)?.[1] || "";
                    const app = text.match(/(?:Aplicação)[:\s]*([^\n]+)/i)?.[1] || "";

                    if (priceRaw) results.push({ nome: name.trim(), codigo: code.trim(), marca: brand.trim(), aplicacao: app.trim(), preco: priceRaw, estoque: 0 });
                });
                return results;
            });
        }
    },
    rmp: {
        login: async (page, supplier) => {
            console.error(`[DEBUG] Login RMP (Usuário + Senha)`);
            const userSel = supplier.loginUserSelector || 'input[name*="user"], input[name*="login"]';
            const passSel = supplier.loginPassSelector || 'input[type="password"]';
            
            await page.waitForSelector(userSel, { state: 'visible' });
            await page.locator(userSel).first().fill(supplier.loginCredential.toString());
            await page.locator(passSel).first().fill(supplier.password.toString());
            await page.keyboard.press('Enter');
        },
        search: async (page, query) => {
            const searchSel = 'input[placeholder*="código" i], input[placeholder*="descrição" i], input.busca';
            await page.waitForSelector(searchSel, { state: 'visible' });
            await page.locator(searchSel).first().fill(query);
            await page.keyboard.press('Enter');
        },
        extract: async (page) => {
            return await page.evaluate(() => {
                const results = [];
                // Layout em lista com filtros laterais
                document.querySelectorAll('.lista-item, tr, .product-list-item').forEach(el => {
                    const text = el.innerText;
                    if (!text.includes('R$')) return;
                    
                    const name = el.querySelector('.nome, h2')?.innerText || text.split('\n')[0];
                    const priceRaw = el.querySelector('.preco, td.price')?.innerText || text.match(/R\$\s?([0-9.,]+)/)?.[0];
                    const code = el.querySelector('.codigo')?.innerText || text.match(/(?:Código|Cód)[:\s]*([a-zA-Z0-9-]+)/i)?.[1] || "";
                    const brand = el.querySelector('.marca')?.innerText || text.match(/(?:Marca)[:\s]*([a-zA-Z0-9]+)/i)?.[1] || "";
                    const app = el.querySelector('.aplicacao')?.innerText || text.match(/(?:Aplicação)[:\s]*([^\n]+)/i)?.[1] || "";

                    if (priceRaw) results.push({ nome: name.trim(), codigo: code.trim(), marca: brand.trim(), aplicacao: app.trim(), preco: priceRaw, estoque: 0 });
                });
                return results;
            });
        }
    },
    sav: {
        login: async (page, supplier) => {
            console.error(`[DEBUG] Login SAV/FURAÇÃO (Usuário + Senha)`);
            const userSel = supplier.loginUserSelector || '#username';
            const passSel = supplier.loginPassSelector || '#password';
            const extraSel = supplier.loginExtraSelector || '#f'; // Select de perfil
            
            await page.waitForSelector(userSel, { state: 'visible' });
            if (supplier.loginExtraValue) {
                try {
                    await page.selectOption(extraSel, supplier.loginExtraValue.toString());
                } catch(e) {}
            }
            await page.locator(userSel).first().fill(supplier.loginCredential.toString());
            await page.locator(passSel).first().fill(supplier.password.toString());
            await page.locator(supplier.loginSubmitSelector || 'button.btn-primary').first().click();
        },
        search: async (page, query) => {
            const searchSel = '#gsearch, input[type="search"]';
            await page.waitForSelector(searchSel, { state: 'visible' });
            await page.locator(searchSel).first().fill(query);
            await page.keyboard.press('Enter');
        },
        extract: async (page) => {
            return await page.evaluate(() => {
                const results = [];
                // Resultados em cards
                document.querySelectorAll('.product-box, .card').forEach(el => {
                    const text = el.innerText;
                    if (!text.includes('R$')) return;
                    
                    const name = el.querySelector('.product-title, .nome')?.innerText || text.split('\n')[0];
                    const priceRaw = el.querySelector('.product-price, .preco')?.innerText || text.match(/R\$\s?([0-9.,]+)/)?.[0];
                    const code = el.querySelector('.product-code')?.innerText || text.match(/(?:Código)[:\s]*([a-zA-Z0-9-]+)/i)?.[1] || "";
                    const brand = el.querySelector('.product-brand')?.innerText || text.match(/(?:Marca)[:\s]*([a-zA-Z0-9]+)/i)?.[1] || "";
                    const stock = text.match(/(?:Estoque|Qtd)[:\s]*([0-9]+)/i)?.[1] || "0";

                    if (priceRaw) results.push({ nome: name.trim(), codigo: code.trim(), marca: brand.trim(), preco: priceRaw, estoque: parseInt(stock) });
                });
                return results;
            });
        }
    },
    sky: {
        login: async (page, supplier) => {
            console.error(`[DEBUG] Login SKY PEÇAS (CNPJ + Usuário + Senha)`);
            const cnpjSel = supplier.loginExtraSelector || 'input[name*="cnpj"], input[placeholder*="cnpj" i]';
            const userSel = supplier.loginUserSelector || 'input[name*="user"], input[name*="login"]';
            const passSel = supplier.loginPassSelector || 'input[type="password"]';
            
            await page.waitForSelector(cnpjSel, { state: 'visible' });
            await page.locator(cnpjSel).first().fill(supplier.loginExtraValue ? supplier.loginExtraValue.toString() : '');
            await page.locator(userSel).first().fill(supplier.loginCredential.toString());
            await page.locator(passSel).first().fill(supplier.password.toString());
            await page.keyboard.press('Enter');
        },
        search: async (page, query) => {
            const searchSel = 'input[placeholder*="código" i], input[placeholder*="descrição" i], input[placeholder*="veículo" i]';
            await page.waitForSelector(searchSel, { state: 'visible' });
            await page.locator(searchSel).first().fill(query);
            await page.keyboard.press('Enter');
        },
        extract: async (page) => {
            return await page.evaluate(() => {
                const results = [];
                // Resultados em lista horizontal
                document.querySelectorAll('tr, .list-row, .horizontal-item').forEach(el => {
                    const text = el.innerText;
                    if (!text.includes('R$')) return;
                    
                    const name = el.querySelector('.nome, .descricao')?.innerText || text.split('\n')[0];
                    const priceRaw = el.querySelector('.preco, .valor')?.innerText || text.match(/R\$\s?([0-9.,]+)/)?.[0];
                    const code = el.querySelector('.codigo, .cod-fab')?.innerText || text.match(/(?:Cód\. Fáb|Código)[:\s]*([a-zA-Z0-9-]+)/i)?.[1] || "";
                    const brand = el.querySelector('.marca')?.innerText || text.match(/(?:Marca)[:\s]*([a-zA-Z0-9]+)/i)?.[1] || "";
                    const stock = text.match(/(?:Estoque|Disponível)[:\s]*([0-9]+)/i)?.[1] || "0";

                    if (priceRaw) results.push({ nome: name.trim(), codigo: code.trim(), marca: brand.trim(), preco: priceRaw, estoque: parseInt(stock) });
                });
                return results;
            });
        }
    }
};

async function scrapeProduct(supplier, productName) {
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--disable-gpu', '--no-first-run',
            '--no-zygote', '--single-process', '--window-size=1920,1080'
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
        console.error(`[DEBUG] Iniciando scraping para: ${supplier.name}`);
        
        const sName = supplier.name.toLowerCase();
        let strategyKey = null;
        if (sName.includes('comdip')) strategyKey = 'comdip';
        else if (sName.includes('kaizen')) strategyKey = 'kaizen';
        else if (sName.includes('rmp')) strategyKey = 'rmp';
        else if (sName.includes('furacao') || sName.includes('sav')) strategyKey = 'sav';
        else if (sName.includes('sky')) strategyKey = 'sky';

        // 1. NAVEGAÇÃO E LOGIN
        const loginUrl = supplier.loginUrl || supplier.url;
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        if (supplier.needsLogin) {
            if (strategyKey && strategies[strategyKey].login) {
                await strategies[strategyKey].login(page, supplier);
            } else {
                // Fallback de login
                const userSel = supplier.loginUserSelector || 'input[type="email"], input[name*="user"], input[name*="login"]';
                const passSel = supplier.loginPassSelector || 'input[type="password"]';
                await page.waitForSelector(userSel, { state: 'visible' });
                await page.locator(userSel).first().fill(supplier.loginCredential.toString());
                await page.locator(passSel).first().fill(supplier.password.toString());
                await page.keyboard.press('Enter');
            }

            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForTimeout(3000);
            
            if (page.url().includes('login') || page.url() === loginUrl) {
                const passVisible = await page.isVisible('input[type="password"]').catch(()=>false);
                if (passVisible) throw new Error("Falha no login: credenciais recusadas ou bloqueio de modal.");
            }
        }

        // Determinar queries de busca: tentar Código e depois Nome
        // O backend passa productName que pode ser o código ou nome. Tentaremos a query diretamente.
        // Se a query falhar ou retornar zero, tentamos uma variação caso seja JSON (ex: {code, name})
        let queries = [productName];
        try {
            const parsed = JSON.parse(productName);
            if (parsed.codigo && parsed.nome) {
                queries = [parsed.codigo, parsed.nome];
            }
        } catch(e) {}

        let finalItems = [];

        for (const query of queries) {
            console.error(`[DEBUG] Buscando por: ${query}`);
            
            // 2. BUSCA
            if (strategyKey && strategies[strategyKey].search) {
                await strategies[strategyKey].search(page, query);
            } else {
                // Fallback busca
                const searchSel = supplier.searchBarSelector || 'input[type="search"], input[type="text"]';
                await page.waitForSelector(searchSel, { state: 'visible' });
                await page.locator(searchSel).first().fill(query);
                await page.keyboard.press('Enter');
            }

            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000); // Aguarda renderização DOM

            // 3. EXTRAÇÃO
            console.error(`[DEBUG] Extraindo itens...`);
            let items = [];
            if (strategyKey && strategies[strategyKey].extract) {
                items = await strategies[strategyKey].extract(page);
            } else {
                // Fallback extração genérica
                items = await page.evaluate(() => {
                    const res = [];
                    document.querySelectorAll('tr, .product-card, .item').forEach(el => {
                        const t = el.innerText;
                        if (!t.includes('R$')) return;
                        const match = t.match(/R\$\s?([0-9.,]+)/);
                        if (match) res.push({ nome: t.split('\n')[0], preco: match[0], codigo: "", marca: "", estoque: 0 });
                    });
                    return res;
                });
            }

            // Converter precos e limpar
            items = items.map(i => {
                return {
                    fornecedor: supplier.name,
                    nome: i.nome,
                    codigo: i.codigo || "",
                    marca: i.marca || "",
                    preco: parsePrice(i.preco),
                    estoque: parseInt(i.estoque) || 0,
                    aplicacao: i.aplicacao || ""
                };
            }).filter(i => i.preco > 0);

            if (items.length > 0) {
                finalItems = items;
                break; // Achou pelo código, não precisa tentar o nome
            } else {
                console.error(`[DEBUG] Nenhum resultado para "${query}". Tentando próxima query se houver.`);
                // Limpar busca antes de tentar a próxima
                await page.goto(supplier.searchUrl || page.url(), { waitUntil: 'domcontentloaded' }).catch(()=>{});
            }
        }

        if (finalItems.length === 0) {
            throw new Error("Nenhum produto encontrado.");
        }

        return finalItems;

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        return {
            fornecedor: supplier.name,
            error: error.message
        };
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct };
