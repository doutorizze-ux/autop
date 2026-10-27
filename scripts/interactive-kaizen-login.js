const { chromium } = require('../scraping/node_modules/playwright');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function run() {
    console.log('Iniciando navegador com tela visível para login no Kaizen...');
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navegando para https://portal.kaizenautopecas.com.br/...');
    await page.goto('https://portal.kaizenautopecas.com.br/', { waitUntil: 'domcontentloaded' });

    try {
        const userInput = page.locator('input[placeholder*="cnpj" i], input[type="text"]').first();
        await userInput.waitFor({ state: 'visible', timeout: 5000 });
        await userInput.fill('33299637000180');
        await userInput.dispatchEvent('input');
        await userInput.dispatchEvent('change');

        const passInput = page.locator('input[type="password"]').first();
        await passInput.fill('Re539597@');
        await passInput.dispatchEvent('input');
        await passInput.dispatchEvent('change');
        console.log('Campos CNPJ e Senha preenchidos!');
    } catch (e) {
        console.log('Campos já preenchidos ou erro:', e.message);
    }

    console.log('Aguardando conclusão do login (redirecionamento para /principal ou token no localStorage)...');
    
    // Aguarda até o token aparecer no localStorage ou a página mudar para /principal
    let token = '';
    let storageState = null;
    for (let i = 0; i < 90; i++) {
        await page.waitForTimeout(1000);
        token = await page.evaluate(() => localStorage.getItem('token') || '').catch(() => '');
        if (token && token.length > 30) {
            console.log('✅ TOKEN KAIZEN OBTIDO COM SUCESSO!');
            storageState = await context.storageState();
            break;
        }
        if (page.url().includes('principal')) {
            token = await page.evaluate(() => localStorage.getItem('token') || '').catch(() => '');
            if (token) {
                storageState = await context.storageState();
                break;
            }
        }
    }

    if (!token) {
        console.error('❌ Tempo limite excedido sem login.');
        await browser.close();
        return;
    }

    // Salva em arquivo e no banco
    fs.mkdirSync('scraping/sessions', { recursive: true });
    fs.writeFileSync('scraping/sessions/kaizen-auto-pecas.json', JSON.stringify(storageState, null, 2));

    const kaizen = await prisma.supplier.findFirst({ where: { name: { contains: 'Kaizen' } } });
    if (kaizen) {
        await prisma.supplier.update({
            where: { id: kaizen.id },
            data: { sessionData: JSON.stringify(storageState) }
        });
        console.log('✅ Sessão da Kaizen salva no banco de dados e disco com sucesso!');
    }

    await browser.close();
    console.log('Finalizado com sucesso!');
}

run().catch(console.error);
