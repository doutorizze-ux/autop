const { chromium } = require('../scraping/node_modules/playwright');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function run() {
    console.log('Iniciando Chrome visível para login no Kaizen...');
    const profilePath = path.resolve(__dirname, '../backend/data/browser-profiles/kaizen-auto-pecas');
    fs.mkdirSync(profilePath, { recursive: true });

    let context;
    try {
        context = await chromium.launchPersistentContext(profilePath, {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1280, height: 800 },
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
        });
    } catch (e) {
        context = await chromium.launchPersistentContext(profilePath, {
            headless: false,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            viewport: { width: 1280, height: 800 },
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
        });
    }

    const page = context.pages()[0] || await context.newPage();
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
        console.log('Campos preenchidos. Por favor, resolva o desafio ou clique em Entrar...');
    } catch (e) {
        console.log('Campos já preenchidos ou erro:', e.message);
    }

    console.log('Aguardando token (até 120 segundos)...');
    let token = '';
    let storageState = null;
    for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(1000);
        token = await page.evaluate(() => localStorage.getItem('token') || '').catch(() => '');
        if (token && token.length > 30) {
            console.log('✅ TOKEN KAIZEN CAPTURADO COM SUCESSO!');
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
        await context.close();
        await prisma.$disconnect();
        return;
    }

    const sessionDir = path.resolve(__dirname, '../scraping/sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, 'kaizen-auto-pecas.json');
    fs.writeFileSync(sessionFile, JSON.stringify(storageState, null, 2));
    console.log('✅ Arquivo salvo em:', sessionFile);

    const kaizen = await prisma.supplier.findFirst({ where: { name: { contains: 'Kaizen' } } });
    if (kaizen) {
        await prisma.supplier.update({
            where: { id: kaizen.id },
            data: { sessionData: JSON.stringify(storageState) }
        });
        console.log('✅ Sessão salva no banco de dados Prisma!');
    }

    await page.waitForTimeout(2000);
    await context.close();
    await prisma.$disconnect();
    console.log('🎉 Kaizen 100% configurado e autenticado!');
}

run().catch(console.error);
