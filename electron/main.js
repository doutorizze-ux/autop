const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;
const BACKEND_PORT = process.env.PORT || 5000;
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;

function startBackend() {
    return new Promise((resolve, reject) => {
        const backendDir = path.resolve(__dirname, '../backend');
        const scriptPath = path.resolve(backendDir, 'dist/index.js');

        console.log('[Electron] Iniciando backend em:', scriptPath);

        const nodeExecutable = process.env.NODE_BINARY || 'node';
        backendProcess = spawn(nodeExecutable, [scriptPath], {
            cwd: backendDir,
            env: {
                ...process.env,
                PORT: String(BACKEND_PORT),
                NODE_ENV: 'production',
                SCRAPER_CONCURRENCY: '3',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        backendProcess.stdout.on('data', (data) => {
            console.log(`[Backend] ${data.toString().trim()}`);
        });

        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend ERR] ${data.toString().trim()}`);
        });

        backendProcess.on('error', (err) => {
            console.error('[Electron] Erro ao iniciar backend:', err);
            reject(err);
        });

        backendProcess.on('exit', (code) => {
            console.log(`[Electron] Backend encerrou com código: ${code}`);
            backendProcess = null;
        });

        // Polling para checar quando o backend está pronto
        let attempts = 0;
        const maxAttempts = 50; // 25 segundos
        const checkReady = () => {
            http.get(HEALTH_URL, (res) => {
                if (res.statusCode === 200) {
                    console.log('[Electron] Backend pronto e respondendo com sucesso!');
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
                reject(new Error('Backend não respondeu a tempo (timeout).'));
            } else {
                setTimeout(checkReady, 500);
            }
        };

        setTimeout(checkReady, 500);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'AutoPeças Hub - Gestão & Cotações',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function killBackend() {
    if (backendProcess) {
        console.log('[Electron] Encerrando backend...');
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
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
            `Não foi possível iniciar o servidor local:\n\n${err.message}\n\nVerifique se a porta ${BACKEND_PORT} está livre.`
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
