const os = require('os');
const fs = require('fs');
const path = require('path');
const { scrapeProduct } = require(path.resolve(__dirname, '../scraping/engine.js'));
const { chromium } = require(path.resolve(__dirname, '../scraping/node_modules/playwright'));

const backendUrl = String(process.env.LOCAL_AGENT_BACKEND_URL || '').trim().replace(/\/+$/, '');
const agentToken = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
const agentId = String(process.env.LOCAL_AGENT_ID || `${os.hostname()}-agent`).trim();
const agentName = String(process.env.LOCAL_AGENT_NAME || `Agente ${os.hostname()}`).trim();
const agentVersion = '1.1.0';
const pollIntervalMs = Number.parseInt(process.env.LOCAL_AGENT_POLL_INTERVAL_MS || '3000', 10) || 3000;
const headless = String(process.env.HEADLESS || 'false').trim() === 'true';

const sessionRoot = path.resolve(__dirname, 'browser-profiles');
const assistSessions = new Map();
const knownBrowserExecutables = [
    process.env.LOCAL_AGENT_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

if (!backendUrl) {
    throw new Error('Defina LOCAL_AGENT_BACKEND_URL antes de iniciar o agente local.');
}

if (!agentToken) {
    throw new Error('Defina LOCAL_AGENT_TOKEN antes de iniciar o agente local.');
}

function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function supplierSlug(value) {
    return String(value || 'supplier')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'supplier';
}

function getSupplierProfilePath(supplierName) {
    return path.join(sessionRoot, supplierSlug(supplierName));
}

function resolveBrowserExecutable() {
    for (const candidate of knownBrowserExecutables) {
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-local-agent-token': agentToken,
            'x-local-agent-id': agentId,
            'x-local-agent-name': agentName,
            'x-local-agent-version': agentVersion,
        },
        body: JSON.stringify(body || {}),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(data?.message || `Falha HTTP ${response.status}`);
    }
    return data;
}

async function heartbeat() {
    return postJson(`${backendUrl}/api/local-agent/heartbeat`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
    });
}

async function nextTask() {
    return postJson(`${backendUrl}/api/local-agent/tasks/next`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
    });
}

async function completeTask(taskId, result) {
    return postJson(`${backendUrl}/api/local-agent/tasks/${taskId}/complete`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
        result,
    });
}

async function failTask(taskId, error) {
    return postJson(`${backendUrl}/api/local-agent/tasks/${taskId}/fail`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
        error: String(error || 'Falha no agente local.'),
    });
}

async function closeAssistSession(supplierId) {
    const existing = assistSessions.get(supplierId);
    if (existing) {
        await existing.context.close().catch(() => {});
        assistSessions.delete(supplierId);
    }
}

async function getOrCreateAssistSession(supplier) {
    const existing = assistSessions.get(supplier.id);
    if (existing) {
        return existing;
    }

    ensureDirectory(sessionRoot);
    const profilePath = getSupplierProfilePath(supplier.name);
    ensureDirectory(profilePath);

    const browserOptions = {
        headless,
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
        args: [
            '--window-size=1280,900',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    };

    const executablePath = resolveBrowserExecutable();
    let context;
    try {
        if (executablePath) {
            console.log(`[Local Agent] Abrindo navegador local: ${executablePath}`);
            context = await chromium.launchPersistentContext(profilePath, {
                ...browserOptions,
                executablePath,
            });
        } else {
            context = await chromium.launchPersistentContext(profilePath, {
                ...browserOptions,
                channel: 'chrome',
            });
        }
    } catch (error) {
        console.error(`[Local Agent] Navegador local preferido indisponivel, usando Chromium: ${error instanceof Error ? error.message : error}`);
        context = await chromium.launchPersistentContext(profilePath, browserOptions);
    }

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        window.chrome = window.chrome || { runtime: {} };
    });

    const page = context.pages()[0] || await context.newPage();
    const session = { supplierId: supplier.id, context, page, profilePath };
    assistSessions.set(supplier.id, session);
    return session;
}

async function buildSnapshot(session) {
    const image = await session.page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });
    return {
        image: `data:image/jpeg;base64,${image.toString('base64')}`,
        url: session.page.url(),
        title: await session.page.title().catch(() => ''),
    };
}

async function handleAssistTask(task) {
    const { supplier, action, payload } = task;

    if (action === 'stop') {
        await closeAssistSession(supplier.id);
        return { stopped: true, mode: 'local-agent' };
    }

    const session = await getOrCreateAssistSession(supplier);
    const page = session.page;

    if (action === 'start') {
        await page.goto(supplier.loginUrl || supplier.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
        return buildSnapshot(session);
    }

    if (action === 'snapshot') {
        return buildSnapshot(session);
    }

    if (action === 'click') {
        await page.mouse.click(Number(payload?.x || 0), Number(payload?.y || 0));
        await page.waitForTimeout(700);
        return buildSnapshot(session);
    }

    if (action === 'type') {
        await page.keyboard.type(String(payload?.text || ''), { delay: 25 });
        await page.waitForTimeout(300);
        return buildSnapshot(session);
    }

    if (action === 'press') {
        await page.keyboard.press(String(payload?.key || 'Enter'));
        await page.waitForTimeout(700);
        return buildSnapshot(session);
    }

    if (action === 'save') {
        const storageState = await session.context.storageState();
        return {
            saved: true,
            profilePath: session.profilePath,
            url: page.url(),
            storageState,
            mode: 'local-agent',
        };
    }

    throw new Error(`Acao de sessao nao suportada: ${action}`);
}

async function processTask(task) {
    if (task.kind === 'supplier-session') {
        console.log(`[Local Agent] Sessao ${task.action} -> ${task.supplier.name}`);
        const result = await handleAssistTask(task);
        await completeTask(task.id, result);
        console.log(`[Local Agent] Sessao concluida: ${task.id}`);
        return;
    }

    console.log(`[Local Agent] Pesquisando ${task.supplier.name} -> ${task.productName}`);
    const result = await scrapeProduct(task.supplier, task.productName);
    await completeTask(task.id, result);
    console.log(`[Local Agent] Tarefa concluida: ${task.id}`);
}

async function mainLoop() {
    console.log(`[Local Agent] Iniciado: ${agentName} (${agentId})`);
    console.log(`[Local Agent] Backend: ${backendUrl}`);

    while (true) {
        try {
            await heartbeat();
            const payload = await nextTask();
            if (payload?.task) {
                await processTask(payload.task);
                continue;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Local Agent] Erro no loop: ${message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
}

mainLoop().catch((error) => {
    console.error('[Local Agent] Encerrado com erro:', error);
    process.exit(1);
});
