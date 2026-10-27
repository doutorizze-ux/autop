const fs = require('fs');
let code = fs.readFileSync('scraping/suppliers/sky.js', 'utf8');

const oldFn = `async function runBranchSearch(page, query, dismissTransientUi) {
    console.log('[SKY DEBUG] runBranchSearch called with query:', query, 'url:', page.url());
    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    try {
        const swalBtn = page.locator('button.swal2-confirm, button.swal2-close, .swal2-actions button, button:has-text("OK")').first();
        if (await swalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await swalBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
        }
    } catch (_) {}

    const inp = page.locator('#inpCodigo, input[placeholder*="codigo" i], #inpPeca').first();
    await inp.fill(String(query || '')).catch(() => {});

    const btn = page.locator('#btnBuscar, button:has-text("Buscar")').first();
    try {
        await btn.click({ force: true, timeout: 8000 });
    } catch (_) {
        await inp.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(3000);
    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    return true;
}`;

const newFn = `async function runBranchSearch(page, query, dismissTransientUi) {
    console.log('[SKY DEBUG] runBranchSearch called with query:', query, 'url:', page.url());
    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    try {
        const swalBtn = page.locator('button.swal2-confirm, button.swal2-close, .swal2-actions button, button:has-text("OK")').first();
        if (await swalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await swalBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
        }
    } catch (_) {}

    const inp = page.locator('#inpCodigo').first();
    await inp.click({ force: true });
    await inp.fill(String(query || ''));
    await inp.dispatchEvent('input');
    await inp.dispatchEvent('change');

    const btn = page.locator('#btnBuscar').first();
    console.log('[SKY DEBUG] Clicking #btnBuscar...');
    await btn.click({ force: true });
    await page.waitForTimeout(4000);
    const count = await page.locator('.bx_produto').count();
    console.log('[SKY DEBUG] .bx_produto found right after click:', count);

    if (typeof dismissTransientUi === 'function') {
        await dismissTransientUi().catch(() => {});
    }
    return true;
}`;

code = code.replace(oldFn, newFn);
fs.writeFileSync('scraping/suppliers/sky.js', code, 'utf8');
console.log('sky.js runBranchSearch improved!');
