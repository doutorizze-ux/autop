const fs = require('fs');
const path = require('path');

const skyPath = path.join(__dirname, '..', 'scraping', 'suppliers', 'sky.js');
let content = fs.readFileSync(skyPath, 'utf8');

const oldCode = `async function runBranchSearch(page, query, dismissTransientUi) {
    await dismissTransientUi();
    await page.locator('#inpCodigo').first().fill(String(query || ''));
    await page.locator('#btnBuscar').first().click();
    await page.waitForTimeout(4000);
    await dismissTransientUi();
    return true;
}`;

const newCode = `async function runBranchSearch(page, query, dismissTransientUi) {
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

const oldNorm = oldCode.replace(/\r\n/g, '\n');
const contentNorm = content.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldNorm)) {
    content = contentNorm.replace(oldNorm, newCode.replace(/\r\n/g, '\n'));
    fs.writeFileSync(skyPath, content, 'utf8');
    console.log('sky.js runBranchSearch updated successfully!');
} else {
    console.log('Target runBranchSearch not found in sky.js.');
}
