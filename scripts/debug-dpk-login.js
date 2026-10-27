const fs = require('fs');
const path = require('path');
const { chromium } = require('../scraping/node_modules/playwright');

async function testDpkLogin() {
    const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    console.log('Navigating to DPK login...');
    await page.goto('https://www.dpk.com.br/#/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('URL:', page.url());
    const inputs = await page.evaluate(() => 
        Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type,
            name: i.name,
            placeholder: i.placeholder,
            formcontrolname: i.getAttribute('formcontrolname')
        }))
    );
    console.log('Inputs on login page:', JSON.stringify(inputs, null, 2));

    console.log('Filling credentials...');
    await page.fill('input[type="email"]', 'atendimento@centroautomotivo0058.com');
    await page.fill('input[type="password"]', 'Re539597@');
    console.log('Submitting login...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        page.click('button:has-text("Entrar")')
    ]);
    await page.waitForTimeout(5000);
    console.log('Post-login URL:', page.url());
    const postLoginSnippet = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Post-login text:', postLoginSnippet.replace(/\n+/g, ' '));

    console.log('Searching via UI input...');
    const searchInputs = await page.evaluate(() => 
        Array.from(document.querySelectorAll('input')).map(i => ({
            placeholder: i.placeholder,
            formcontrolname: i.getAttribute('formcontrolname'),
            cls: i.className
        }))
    );
    console.log('Inputs on home:', searchInputs);

    page.on('response', res => {
        if (res.url().includes('produto') || res.url().includes('busca') || res.url().includes('catalogo') || res.url().includes('item')) {
            console.log(`[API RESPONSE] ${res.status()} ${res.url()}`);
        }
    });

    console.log('Filling search term and clicking search button...');
    const searchInput = page.locator('input[formcontrolname="searchTerm"], input[placeholder*="código ou descrição" i]').first();
    await searchInput.fill('filtro');
    const searchBtn = page.locator('button:has-text("Buscar"), button.btn-buscar').first();
    await searchBtn.click();
    await page.waitForTimeout(6000);
    const sessionPath = path.join(__dirname, '..', 'scraping', 'sessions', 'dpk.json');
    const storage = await page.context().storageState();
    const ls = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            out[k] = localStorage.getItem(k);
        }
        return out;
    });
    const finalSession = {
        cookies: storage.cookies,
        origins: storage.origins,
        localStorage: ls
    };
    fs.writeFileSync(sessionPath, JSON.stringify(finalSession, null, 2));
    console.log(`Saved session to ${sessionPath} with ${storage.cookies.length} cookies and ${Object.keys(ls).length} localStorage items!`);
    await browser.close();
}

testDpkLogin().catch(console.error);
