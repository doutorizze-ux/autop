const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'scraping', 'engine.js');
let content = fs.readFileSync(enginePath, 'utf8');

// 1. Selector check fix
const oldCheck = `        if (supplier.needsLogin) {
            const alreadyLogged = await isAnySelectorVisible(
                page,
                buildSelectorList(
                    strategy.loginSuccessSelector,
                    supplier.searchBarSelector,
                    strategy.searchSelector
                ),
                3000
            );`;

const newCheck = `        if (supplier.needsLogin) {
            const explicitSuccess = buildSelectorList(strategy.loginSuccessSelector);
            const checkSelectors = explicitSuccess.length
                ? explicitSuccess
                : buildSelectorList(supplier.searchBarSelector, strategy.searchSelector);

            const alreadyLogged = await isAnySelectorVisible(
                page,
                checkSelectors,
                3000
            );`;

if (content.includes(oldCheck)) {
    content = content.replace(oldCheck, newCheck);
    console.log('Patch 1 applied: login check precision.');
} else {
    // try normalized line endings
    const oldCheckNorm = oldCheck.replace(/\r\n/g, '\n');
    const contentNorm = content.replace(/\r\n/g, '\n');
    if (contentNorm.includes(oldCheckNorm)) {
        content = contentNorm.replace(oldCheckNorm, newCheck.replace(/\r\n/g, '\n'));
        console.log('Patch 1 applied (normalized).');
    } else {
        console.log('Patch 1 target not found.');
    }
}

// 2. Auto re-login on items without price
const oldNoPrice = `            if (!finalItems.length && hasVisibleItemsWithoutPrice(items)) {
                throw new Error('Produto localizado, mas o portal nao exibiu preco. Sessao/login pode estar invalido para este fornecedor.');
            }`;

const newNoPrice = `            if (!finalItems.length && hasVisibleItemsWithoutPrice(items)) {
                if (supplier.needsLogin && (supplier.password || supplier.loginCredential) && !didLoginThisRun) {
                    console.error(\`[WARN] \${supplier.name} exibiu itens sem preco. Sessao expirou! Tentando re-login automatico imediato...\`);
                    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
                    await page.waitForTimeout(1500);
                    await dismissTransientUi(page);
                    const preLoginUrl = page.url();
                    await runGenericLogin(page, supplier, strategy);
                    didLoginThisRun = true;
                    await waitForLoginCompletion(page, preLoginUrl, loginUrl, supplier, strategy, {
                        ignoreSessionDataHint: true,
                    });
                    await persistSession(context, supplier, true);

                    if (strategy.performSearch) {
                        await strategy.performSearch({ page, query, supplier, dismissTransientUi });
                    } else if (supplier.searchUrl) {
                        const targetSearchUrl = supplier.searchUrl.includes('{query}')
                            ? supplier.searchUrl.replace(/{query}/gi, encodeURIComponent(query))
                            : \`\${supplier.searchUrl.replace(/\\/+$/, '')}/\${encodeURIComponent(query)}\`;
                        await page.goto(targetSearchUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
                    }

                    if (strategy.extractItems) {
                        items = await strategy.extractItems({ page, supplier, query, dismissTransientUi });
                    }
                    if (!items.length) {
                        items = await extractWithConfiguredSelectors(page, supplier, strategy);
                    }
                    finalItems = buildBrowserPayload(items, supplier);
                }

                if (!finalItems.length) {
                    throw new Error('Produto localizado, mas o portal nao exibiu preco. Sessao/login pode estar invalido para este fornecedor.');
                }
            }`;

if (content.includes(oldNoPrice)) {
    content = content.replace(oldNoPrice, newNoPrice);
    console.log('Patch 2 applied: auto-relogin on expired price.');
} else {
    const oldNoPriceNorm = oldNoPrice.replace(/\r\n/g, '\n');
    const contentNorm = content.replace(/\r\n/g, '\n');
    if (contentNorm.includes(oldNoPriceNorm)) {
        content = contentNorm.replace(oldNoPriceNorm, newNoPrice.replace(/\r\n/g, '\n'));
        console.log('Patch 2 applied (normalized).');
    } else {
        console.log('Patch 2 target not found.');
    }
}

fs.writeFileSync(enginePath, content, 'utf8');
console.log('Engine patched successfully!');
