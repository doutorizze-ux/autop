const fs = require('fs');

const path = 'scraping/suppliers/comdip.js';
let content = fs.readFileSync(path, 'utf8');

const oldFillLogin = `    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const consentSelectors = [
            'label:has-text("Confirmo")',
            'text="Confirmo que li"',
            'input[name="cbAceitarTermos"]',
            '#mat-slide-toggle-1-input',
            'input[type="checkbox"]',
        ];

        for (const selector of consentSelectors) {
            const locator = page.locator(selector).first();
            if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
                await locator.click({ force: true }).catch(() => {});
                await page.waitForTimeout(400);
                break;
            }
        }

        const emailField = page.locator(
            'input[placeholder*="cnpj/cpf" i], input[id^="mat-input-0"], input[name*="cnpj" i], input[type="email"], input[placeholder*="email" i]'
        ).first();
        const passField = page.locator(
            'input[placeholder*="senha" i], input[type="password"], input[id^="mat-input-1"]'
        ).first();

        if (await emailField.isVisible().catch(() => false)) {
            await fillVisibleLocator(emailField, supplier.loginCredential || supplier.loginExtraValue || '');
        }

        if (await passField.isVisible().catch(() => false)) {
            await fillVisibleLocator(passField, supplier.password || '');
        }
    },`;

const newFillLogin = `    fillLogin: async ({ page, supplier, fillVisibleLocator, dismissTransientUi }) => {
        await dismissTransientUi();

        const emailField = page.locator('#mat-input-0, input[placeholder*="cnpj" i], input[placeholder*="email" i]').first();
        if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await emailField.click();
            await emailField.fill(supplier.loginCredential || supplier.loginExtraValue || '33.299.637/0001-80');
        }

        const passField = page.locator('#mat-input-1, input[placeholder*="senha" i], input[type="password"]').first();
        if (await passField.isVisible({ timeout: 5000 }).catch(() => false)) {
            await passField.click();
            await passField.fill(supplier.password || 'Re539597@');
        }

        const consentSelectors = [
            'input[name="cbAceitarTermos"]',
            'label:has-text("Confirmo")',
            'text="Confirmo que li"',
            '#mat-slide-toggle-1-input',
            'input[type="checkbox"]',
        ];

        for (const selector of consentSelectors) {
            const locator = page.locator(selector).first();
            if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
                await locator.click({ force: true }).catch(() => {});
                await page.waitForTimeout(400);
                break;
            }
        }
    },`;

content = content.replace(/\r\n/g, '\n');
const normalizedOld = oldFillLogin.replace(/\r\n/g, '\n');
if (content.includes(normalizedOld)) {
    content = content.replace(normalizedOld, newFillLogin);
    fs.writeFileSync(path, content, 'utf8');
    console.log('PATCH_OK: comdip.js updated successfully!');
} else {
    console.log('PATCH_FAIL: pattern not found');
}
