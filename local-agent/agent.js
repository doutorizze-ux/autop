const os = require('os');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { scrapeProduct } = require(path.resolve(__dirname, '../scraping/engine.js'));
const { resolveStrategy } = require(path.resolve(__dirname, '../scraping/suppliers'));
const { chromium } = require(path.resolve(__dirname, '../scraping/node_modules/playwright'));

const backendUrl = String(process.env.LOCAL_AGENT_BACKEND_URL || '').trim().replace(/\/+$/, '');
const agentToken = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
const agentId = String(process.env.LOCAL_AGENT_ID || `${os.hostname()}-agent`).trim();
const agentName = String(process.env.LOCAL_AGENT_NAME || `Agente ${os.hostname()}`).trim();
const agentVersion = '1.1.0';
const pollIntervalMs = Number.parseInt(process.env.LOCAL_AGENT_POLL_INTERVAL_MS || '3000', 10) || 3000;
const headless = String(process.env.HEADLESS || 'true').trim() === 'true';
const searchWorkerCount = Math.max(1, Number.parseInt(process.env.LOCAL_AGENT_SEARCH_WORKERS || '3', 10) || 3);
let cachedDashboardToken = null;

const sessionRoot = path.resolve(__dirname, 'browser-profiles');
if (!process.env.SCRAPER_PROFILE_ROOT) {
    process.env.SCRAPER_PROFILE_ROOT = sessionRoot;
}
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

function getSystemChromeUserDataRoot() {
    return process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
        : null;
}

function resolveBrowserExecutable() {
    for (const candidate of knownBrowserExecutables) {
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function copyDirectory(sourceDir, targetDir) {
    ensureDirectory(targetDir);

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
    }
}

async function readDashboardTokenFromChrome(forceRefresh = false) {
    if (!forceRefresh && cachedDashboardToken) {
        return cachedDashboardToken;
    }

    const chromeDefaultProfile = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default')
        : '';

    if (!chromeDefaultProfile || !fs.existsSync(chromeDefaultProfile)) {
        return null;
    }

    const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopecas-agent-token-'));
    const tempDefaultProfile = path.join(tempUserDataDir, 'Default');
    ensureDirectory(tempDefaultProfile);

    for (const folderName of ['Local Storage', 'Session Storage']) {
        const sourceDir = path.join(chromeDefaultProfile, folderName);
        if (fs.existsSync(sourceDir)) {
            copyDirectory(sourceDir, path.join(tempDefaultProfile, folderName));
        }
    }

    const browserOptions = {
        headless: true,
        viewport: { width: 1280, height: 900 },
        ignoreHTTPSErrors: true,
    };

    let context;
    try {
        try {
            context = await chromium.launchPersistentContext(tempUserDataDir, {
                ...browserOptions,
                channel: 'chrome',
            });
        } catch (_) {
            context = await chromium.launchPersistentContext(tempUserDataDir, browserOptions);
        }

        const page = context.pages()[0] || await context.newPage();
        await page.goto('https://centroautomotivo0058.store/dashboard', {
            waitUntil: 'domcontentloaded',
            timeout: 120000,
        }).catch(() => {});
        await page.waitForTimeout(1500);

        const token = await page.evaluate(() => localStorage.getItem('token')).catch(() => null);
        cachedDashboardToken = String(token || '').trim() || null;
        return cachedDashboardToken;
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
        fs.rmSync(tempUserDataDir, { recursive: true, force: true });
    }
}

async function postJson(url, body, retry = true) {
    const browserToken = await readDashboardTokenFromChrome();
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-local-agent-token': agentToken,
            'x-local-agent-id': agentId,
            'x-local-agent-name': agentName,
            'x-local-agent-version': agentVersion,
            ...(browserToken ? { Authorization: `Bearer ${browserToken}` } : {}),
        },
        body: JSON.stringify(body || {}),
    });

    if (response.status === 401 && retry) {
        const responseText = await response.text().catch(() => '');
        if (responseText.toLowerCase().includes('token do agente local invalido')) {
            await readDashboardTokenFromChrome(true).catch(() => null);
            return postJson(url, body, false);
        }
    }

    const text = await response.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_) {
            const compactText = String(text || '').replace(/\s+/g, ' ').trim();
            throw new Error(`Resposta invalida do backend (${response.status}): ${compactText.slice(0, 180)}`);
        }
    }
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

async function nextTask(preferredKind = 'any') {
    return postJson(`${backendUrl}/api/local-agent/tasks/next`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
        preferredKind,
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
        await existing.browser?.close?.().catch(() => {});
        await existing.context?.close?.().catch(() => {});
        if (existing.chromeProcess && !existing.chromeProcess.killed) {
            try {
                existing.chromeProcess.kill();
            } catch (_) {}
        }
        assistSessions.delete(supplierId);
    }
}

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            let body = '';
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = address && typeof address === 'object' ? address.port : 0;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

async function waitForCdp(port, timeoutMs = 20000) {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            const version = await httpGetJson(`http://127.0.0.1:${port}/json/version`);
            if (version?.webSocketDebuggerUrl) {
                return version;
            }
        } catch (_) {}

        await wait(300);
    }

    throw new Error(`Chrome nao abriu o DevTools na porta ${port}.`);
}

async function getAssistPage(session) {
    const pages = session.context.pages();
    if (pages.length) {
        return pages[0];
    }

    return session.context.newPage();
}

async function launchHumanChromeAssist(profilePath, startUrl) {
    const executablePath = resolveBrowserExecutable();
    if (!executablePath) {
        throw new Error('Chrome local nao encontrado para Login Assistido.');
    }

    const port = await findFreePort();
    const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profilePath}`,
        '--no-first-run',
        '--new-window',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        startUrl || 'about:blank',
    ];

    const chromeProcess = spawn(executablePath, args, {
        detached: false,
        stdio: 'ignore',
        windowsHide: false,
    });

    const version = await waitForCdp(port);
    const browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await getAssistPage({ context });

    return {
        browser,
        context,
        page,
        chromeProcess,
        port,
    };
}

async function getOrCreateAssistSession(supplier) {
    const existing = assistSessions.get(supplier.id);
    if (existing) {
        return existing;
    }

    ensureDirectory(sessionRoot);
    const profilePath = getSupplierProfilePath(supplier.name);
    ensureDirectory(profilePath);

    const strategy = resolveStrategy(supplier);
    const startUrl = String(
        strategy.authenticatedUrl
        || supplier.searchUrl
        || supplier.loginUrl
        || supplier.url
        || 'about:blank'
    ).trim();

    console.log(`[Local Agent] Abrindo Chrome humano para Login Assistido: ${profilePath}`);
    const launched = await launchHumanChromeAssist(profilePath, startUrl);
    const session = {
        supplierId: supplier.id,
        context: launched.context,
        browser: launched.browser,
        chromeProcess: launched.chromeProcess,
        page: launched.page,
        profilePath,
        port: launched.port,
    };
    assistSessions.set(supplier.id, session);
    return session;
}

async function buildSnapshot(session) {
    const page = await getAssistPage(session);
    session.page = page;
    const image = await page.screenshot({ type: 'jpeg', quality: 40, fullPage: false });
    return {
        image: `data:image/jpeg;base64,${image.toString('base64')}`,
        url: page.url(),
        title: await page.title().catch(() => ''),
    };
}

async function handleAssistTask(task) {
    const { supplier, action, payload } = task;
    const strategy = resolveStrategy(supplier);

    if (action === 'stop') {
        await closeAssistSession(supplier.id);
        return { stopped: true, mode: 'local-agent' };
    }

    const session = await getOrCreateAssistSession(supplier);
    const page = await getAssistPage(session);
    session.page = page;

    if (action === 'start') {
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
        const storageState = await session.context.storageState().catch(() => ({ cookies: [], origins: [] }));
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

async function workerLoop(workerName, preferredKind) {
    console.log(`[Local Agent] Worker ${workerName} pronto (${preferredKind})`);

    while (true) {
        try {
            const payload = await nextTask(preferredKind);
            if (payload?.task) {
                await processTask(payload.task);
                continue;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Local Agent] Erro no worker ${workerName}: ${message}`);
        }

        await wait(pollIntervalMs);
    }
}

async function heartbeatLoop() {
    while (true) {
        try {
            await heartbeat();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Local Agent] Erro no heartbeat: ${message}`);
        }

        await wait(pollIntervalMs);
    }
}

async function mainLoop() {
    console.log(`[Local Agent] Iniciado: ${agentName} (${agentId})`);
    console.log(`[Local Agent] Backend: ${backendUrl}`);
    console.log(`[Local Agent] Headless busca: ${headless ? 'sim' : 'nao'}`);
    console.log(`[Local Agent] Workers de busca: ${searchWorkerCount}`);

    const loops = [
        heartbeatLoop(),
        workerLoop('session', 'supplier-session'),
        ...Array.from({ length: searchWorkerCount }, (_, index) => workerLoop(`search-${index + 1}`, 'search')),
    ];

    await Promise.all(loops);
}

mainLoop().catch((error) => {
    console.error('[Local Agent] Encerrado com erro:', error);
    process.exit(1);
});
