const { chromium } = require('../scraping/node_modules/playwright');

async function test() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: 'scraping/sessions/rolemar-master.json' });
    const page = await ctx.newPage();
    await page.goto('https://rolemarmaster.com/');
    await page.waitForTimeout(1000);

    const selectors = [
        'input[placeholder*="PESQUISE" i]',
        '.user-menu-trigger',
        '.filial-dropdown-trigger',
        '#header-form-search',
    ];

    for (const s of selectors) {
        const vis = await page.locator(s).first().isVisible({ timeout: 1000 }).catch(() => false);
        console.log(s, ':', vis);
    }

    console.log('Current URL:', page.url());
    console.log('Title:', await page.title());
    await browser.close();
}

test().catch(console.error);
