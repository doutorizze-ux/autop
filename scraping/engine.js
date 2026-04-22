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

            // AUTO-DISMISS POPUPS/BANNERS
            try {
                const closeSelectors = ['button:has-text("Aceitar")', 'button:has-text("OK")', 'button:has-text("Fechar")', '.close', '#close', '[class*="close"]', 'button:has-text("Confirmar")'];
                for (const sel of closeSelectors) {
                    const btn = page.locator(sel).first();
                    if (await btn.isVisible()) {
                        await btn.click().catch(() => {});
                    }
                }
            } catch (e) {}
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
            try {
                // Tenta ser o mais genérico possível na captura de blocos de produto
                const containerSel = (s.itemContainerSelector && !s.itemContainerSelector.includes(':')) 
                    ? s.itemContainerSelector 
                    : '.prod-item, .product-item, .item-produto, article, tr, .product-card';
                
                let items = Array.from(document.querySelectorAll(containerSel));
                
                // Heurística de emergência: se não achou pelo seletor, procura qualquer DIV que tenha um R$
                if (items.length === 0) {
                    items = Array.from(document.querySelectorAll('div, tr, li')).filter(el => {
                        const text = el.innerText || '';
                        return text.includes('R$') && text.length < 600 && text.length > 40;
                    });
                }

                const extracted = items.map(item => {
                    try {
                        const text = item.innerText || '';
                        // Regex ultra-robusto para pegar o valor após R$
                        const match = text.match(/R\$\s?([0-9.]+[,.][0-9]{2})/);
                        if (match) {
                            let p = match[1].replace(/\./g, '').replace(',', '.');
                            const val = parseFloat(p);
                            if (val > 5) { // Ignora valores muito baixos que não são a peça
                                return {
                                    provider: s.name,
                                    product: text.split('\n')[0].substring(0, 50).trim(),
                                    price: val.toFixed(2),
                                    available: true
                                };
                            }
                        }
                    } catch (e) {}
                    return null;
                }).filter(r => r !== null);

                // Ordena por preço (menor primeiro) para pegar o preço mais competitivo
                return extracted.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 3);
            } catch (err) {
                return [];
            }
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
