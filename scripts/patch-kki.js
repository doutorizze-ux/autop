const fs = require('fs');
const path = require('path');

const kkiPath = path.join(__dirname, '..', 'scraping', 'suppliers', 'kki.js');
let content = fs.readFileSync(kkiPath, 'utf8');

// 1. Add "Atualizar" dismiss in performSearch
const oldPerform = `    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();`;

const newPerform = `    performSearch: async ({ page, query, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();
        try {
            const atualizar = page.locator('button:has-text("Atualizar")').first();
            if (await atualizar.isVisible({ timeout: 1500 }).catch(() => false)) {
                await atualizar.click().catch(() => {});
                await page.waitForTimeout(2000);
            }
        } catch (_) {}`;

// 2. Change provider in extractItems to supplierName
const oldProvider = `provider: distributor ? \`\${supplierName} - \${distributor}\` : supplierName,`;
const newProvider = `provider: supplierName,`;

const oldPerformNorm = oldPerform.replace(/\r\n/g, '\n');
const contentNorm = content.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldPerformNorm)) {
    content = contentNorm.replace(oldPerformNorm, newPerform.replace(/\r\n/g, '\n'));
}

content = content.replace(oldProvider, newProvider);

fs.writeFileSync(kkiPath, content, 'utf8');
console.log('kki.js updated successfully!');
