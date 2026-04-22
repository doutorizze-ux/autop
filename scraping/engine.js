const { chromium } = require('playwright');

/**
 * Função principal de scraping ultra-robusta
 */
async function scrapeProduct(supplier, productName) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    try {
        console.log(`[${supplier.name}] Iniciando busca: ${productName}`);

        // 1. LOGIN
        if (supplier.needsLogin) {
            console.log(`[${supplier.name}] Fazendo login...`);
            await page.goto(supplier.loginUrl || supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
            
            // Heurística de Campo Extra (CNPJ/Perfil)
            if (supplier.loginExtraSelector && supplier.loginExtraValue) {
                try {
                    const el = page.locator(supplier.loginExtraSelector).first();
                    const tagName = await el.evaluate(e => e.tagName).catch(() => 'INPUT');
                    if (tagName === 'SELECT') {
                        await el.selectOption({ label: supplier.loginExtraValue }).catch(() => {});
                    } else {
                        await el.fill(supplier.loginExtraValue.toString()).catch(() => {});
                    }
                } catch (e) {}
            }

            // Fill User
            const userSelectors = supplier.loginUserSelector ? [supplier.loginUserSelector] : ['input[type="text"]', 'input[name*="user"]', 'input[name*="login"]'];
            for (const s of userSelectors) {
                try {
                    await page.locator(s).first().fill(supplier.loginCredential.toString());
                    break;
                } catch(e) {}
            }

            // Fill Pass
            const passSelectors = supplier.loginPassSelector ? [supplier.loginPassSelector] : ['input[type="password"]', 'input[name*="pass"]'];
            for (const s of passSelectors) {
                try {
                    await page.locator(s).first().fill(supplier.password.toString());
                    break;
                } catch(e) {}
            }

            // Submit
            const btnSelectors = supplier.loginSubmitSelector ? [supplier.loginSubmitSelector] : ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Entrar")'];
            for (const s of btnSelectors) {
                try {
                    if (s.includes('has-text')) {
                        await page.locator(s).first().click();
                    } else {
                        await page.click(s);
                    }
                    break;
                } catch(e) {}
            }
            await page.waitForTimeout(5000);
        } else {
            await page.goto(supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        }

        // 2. SEARCH
        console.log(`[${supplier.name}] Buscando produto...`);
        const searchBarSelectors = supplier.searchBarSelector ? [supplier.searchBarSelector] : ['input[type="search"]', 'input[placeholder*="busca" i]', 'input[name*="busca"]'];
        let filled = false;
        for (const s of searchBarSelectors) {
            try {
                await page.locator(s).first().fill(productName);
                filled = true;
                break;
            } catch(e) {}
        }

        if (filled) {
            await page.keyboard.press('Enter');
            if (supplier.itemContainerSelector) {
                await page.waitForSelector(supplier.itemContainerSelector, { timeout: 10000 }).catch(() => {});
            } else {
                await page.waitForTimeout(8000);
            }
        }

        // 3. EXTRACTION
        console.log(`[${supplier.name}] Extraindo dados...`);
        const results = await page.evaluate((s) => {
            const containerSel = (s.itemContainerSelector && !s.itemContainerSelector.includes('has-text')) 
                ? s.itemContainerSelector 
                : '[class*="product-item"], [class*="prod-container"], .item, article, tr';
            
            let items = Array.from(document.querySelectorAll(containerSel));
            
            // Heurística de emergência se não achar itens
            if (items.length === 0) {
                items = Array.from(document.querySelectorAll('div, tr')).filter(el => {
                    const text = el.innerText || '';
                    return text.includes('R$') && text.length < 1000 && text.length > 30;
                });
            }

            return items.slice(0, 5).map(item => {
                let name = 'Peça Automotiva';
                let price = '0.00';
                
                try {
                    // Nome
                    const nameSel = (s.productNameSelector && !s.productNameSelector.includes('has-text')) ? s.productNameSelector : 'h1, h2, h3, h4, strong, [class*="name"], [class*="title"]';
                    const nameEl = item.querySelector(nameSel);
                    name = nameEl ? nameEl.innerText.split('\n')[0].trim() : (item.innerText.substring(0, 40) + '...');
                    
                    // Preço (Lógica de Regex é a mais robusta)
                    const text = item.innerText || '';
                    const match = text.match(/R\$\s?([0-9.,]+)/);
                    if (match) {
                        let p = match[1].replace(/\./g, '').replace(',', '.');
                        price = parseFloat(p).toFixed(2);
                    }
                } catch (e) {}

                return {
                    provider: s.name,
                    product: name,
                    price: price,
                    link: window.location.href,
                    available: true
                };
            }).filter(r => parseFloat(r.price) > 0);
        }, supplier);

        if (results && results.length > 0) return results;

        return [{ provider: supplier.name, error: 'Não foi possível extrair preços deste portal.' }];

    } catch (error) {
        console.error('Erro no Scraper:', error.message);
        return [{ provider: supplier.name, error: error.message }];
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { scrapeProduct };
