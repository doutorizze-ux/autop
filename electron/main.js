const { app, BrowserWindow, dialog, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;
let activeBackendPort = 5000;
const whatsappWindows = new Map();

// Permitir autoplay de som de chamada sem interação prévia e evitar suspensão/congelamento em segundo plano
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const WHATSAPP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function configureWhatsappSession(ses) {
    if (!ses) return;
    try {
        ses.setUserAgent(WHATSAPP_USER_AGENT);
        ses.setPermissionRequestHandler((webContents, permission, callback) => {
            const allowed = ['media', 'mediaKeySystem', 'notifications', 'audioCapture', 'videoCapture', 'display-capture'];
            callback(allowed.includes(permission));
        });
        ses.setPermissionCheckHandler((webContents, permission) => {
            const allowed = ['media', 'mediaKeySystem', 'notifications', 'audioCapture', 'videoCapture', 'display-capture'];
            return allowed.includes(permission);
        });
    } catch (_) {}
}

// Garantir instância única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// Helper para encontrar porta livre
function findFreePort(startPort) {
    return new Promise((resolve) => {
        const check = (port) => {
            const server = net.createServer();
            server.unref();
            server.on('error', () => {
                check(port + 1);
            });
            server.listen(port, '0.0.0.0', () => {
                server.close(() => {
                    resolve(port);
                });
            });
        };
        check(startPort);
    });
}

function startBackend() {
    return new Promise(async (resolve, reject) => {
        const baseDir = app.isPackaged
            ? path.join(process.resourcesPath, 'app')
            : path.resolve(__dirname, '..');
        const backendDir = path.join(baseDir, 'backend');
        const scriptPath = path.join(backendDir, 'dist/index.js');

        // Configuração de diretório de dados do usuário e logs
        const userDataDir = app.getPath('userData');
        const logsDir = path.join(userDataDir, 'logs');
        try {
            fs.mkdirSync(logsDir, { recursive: true });
        } catch (_) {}
        const logFilePath = path.join(logsDir, 'backend.log');
        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

        const log = (msg) => {
            const line = `[${new Date().toISOString()}] ${msg}\n`;
            try { logStream.write(line); } catch (_) {}
            console.log(msg);
        };

        log('[Electron] Iniciando backend em: ' + scriptPath);

        // Garantir banco persistente e pré-populado em userData
        const dbTarget = path.join(userDataDir, 'database.db');
        const bundledDb = app.isPackaged
            ? path.join(process.resourcesPath, 'app/backend/prisma/dev.db')
            : path.resolve(__dirname, '../backend/prisma/dev.db');

        try {
            if (!fs.existsSync(dbTarget) && fs.existsSync(bundledDb)) {
                fs.copyFileSync(bundledDb, dbTarget);
                log(`[Electron] Banco padrão com 8 fornecedores copiado para: ${dbTarget}`);
            }
        } catch (e) {
            log(`[Electron Warning] Falha ao copiar banco para userData: ${e.message}`);
        }

        const effectiveDbUrl = fs.existsSync(dbTarget)
            ? `file:${dbTarget.replace(/\\/g, '/')}`
            : undefined;

        // Encontrar porta livre
        try {
            activeBackendPort = await findFreePort(process.env.PORT ? parseInt(process.env.PORT, 10) : 5000);
            log(`[Electron] Porta selecionada para backend: ${activeBackendPort}`);
        } catch (e) {
            activeBackendPort = 5000;
        }

        const nodeExecutable = process.env.NODE_BINARY || process.execPath;
        let stderrBuffer = '';

        const spawnEnv = {
            ...process.env,
            PORT: String(activeBackendPort),
            NODE_ENV: 'production',
            SCRAPER_CONCURRENCY: '2',
            SCRAPER_SUPPLIER_TIMEOUT_MS: '120000',
            SCRAPER_PAGE_TIMEOUT_MS: '90000',
            ELECTRON_RUN_AS_NODE: '1',
        };

        if (effectiveDbUrl) {
            spawnEnv.DATABASE_URL = effectiveDbUrl;
        }

        backendProcess = spawn(nodeExecutable, [scriptPath], {
            cwd: backendDir,
            env: spawnEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        backendProcess.stdout.on('data', (data) => {
            const str = data.toString();
            log(`[Backend] ${str.trim()}`);
        });

        backendProcess.stderr.on('data', (data) => {
            const str = data.toString();
            stderrBuffer += str;
            log(`[Backend ERR] ${str.trim()}`);
        });

        backendProcess.on('error', (err) => {
            log('[Electron] Erro de spawn no backend: ' + err.message);
            reject(err);
        });

        let isReady = false;
        backendProcess.on('exit', (code) => {
            log(`[Electron] Backend encerrou com código: ${code}`);
            backendProcess = null;
            if (!isReady) {
                reject(new Error(`O servidor local encerrou prematuramente (código ${code}).\n\nDetalhes:\n${stderrBuffer.slice(-500) || 'Sem mensagens de erro.'}`));
            }
        });

        // Polling para checar quando o backend está pronto usando 127.0.0.1
        let attempts = 0;
        const maxAttempts = 180; // 90 segundos (tempo suficiente para o primeiro início pós-instalação e varredura do antivírus)
        const healthUrl = `http://127.0.0.1:${activeBackendPort}/api/health`;

        const checkReady = () => {
            if (!backendProcess) return;

            http.get(healthUrl, (res) => {
                if (res.statusCode === 200) {
                    isReady = true;
                    log('[Electron] Backend pronto e respondendo com sucesso!');
                    resolve();
                } else {
                    retry();
                }
            }).on('error', () => {
                retry();
            });
        };

        const retry = () => {
            attempts++;
            if (attempts >= maxAttempts) {
                reject(new Error(`Backend não respondeu a tempo (timeout).\n\nÚltimos logs:\n${stderrBuffer.slice(-400) || 'Verifique se a porta ' + activeBackendPort + ' está disponível.'}`));
            } else {
                setTimeout(checkReady, 500);
            }
        };

        setTimeout(checkReady, 400);
    });
}

function createWindow() {
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app/build/icon.ico')
        : path.join(__dirname, '../build/icon.ico');

    const preloadPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app/electron/preload.js')
        : path.join(__dirname, 'preload.js');

    // Pré-configurar permissões e user-agent para as 3 partições do WhatsApp
    const knownPartitions = [
        'persist:whatsapp_atendimento_1',
        'persist:whatsapp_atendimento_2',
        'persist:whatsapp_cotacao',
    ];
    for (const part of knownPartitions) {
        configureWhatsappSession(session.fromPartition(part));
    }

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Centro Automotivo 0058',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            backgroundThrottling: false,
            preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
        },
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.loadURL(`http://127.0.0.1:${activeBackendPort}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Handler para abrir qualquer uma das 3 contas em janela dedicada destacável
ipcMain.handle('open-whatsapp-window', (event, { channelKey, label }) => {
    const safeKey = String(channelKey || 'atendimento_1').replace(/-/g, '_');
    const partitionName = `persist:whatsapp_${safeKey}`;
    const windowKey = safeKey;

    if (whatsappWindows.has(windowKey)) {
        const existingWin = whatsappWindows.get(windowKey);
        if (existingWin && !existingWin.isDestroyed()) {
            if (existingWin.isMinimized()) existingWin.restore();
            existingWin.focus();
            return { success: true, focused: true };
        }
    }

    const ses = session.fromPartition(partitionName);
    configureWhatsappSession(ses);

    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app/build/icon.ico')
        : path.join(__dirname, '../build/icon.ico');

    const win = new BrowserWindow({
        width: 1180,
        height: 850,
        minWidth: 800,
        minHeight: 600,
        title: `WhatsApp - ${label || 'Atendimento'} (Centro Automotivo 0058)`,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        autoHideMenuBar: true,
        webPreferences: {
            session: ses,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });

    win.loadURL('https://web.whatsapp.com', { userAgent: WHATSAPP_USER_AGENT });

    win.on('closed', () => {
        whatsappWindows.delete(windowKey);
    });

    whatsappWindows.set(windowKey, win);
    return { success: true, opened: true };
});

function killBackend() {
    if (backendProcess) {
        console.log('[Electron] Encerrando backend...');
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
            } else {
                backendProcess.kill('SIGTERM');
            }
        } catch (_) {}
        backendProcess = null;
    }
}

app.on('ready', async () => {
    try {
        await startBackend();
        createWindow();
    } catch (err) {
        dialog.showErrorBox(
            'Erro ao Iniciar o Sistema',
            `Não foi possível iniciar o servidor local:\n\n${err.message}`
        );
        app.quit();
    }
});

app.on('window-all-closed', () => {
    killBackend();
    app.quit();
});

app.on('before-quit', () => {
    killBackend();
});

process.on('SIGINT', () => {
    killBackend();
    process.exit(0);
});

process.on('SIGTERM', () => {
    killBackend();
    process.exit(0);
});
