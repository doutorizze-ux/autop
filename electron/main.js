const { app, BrowserWindow, dialog, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const http = require('http');

let mainWindow = null;
let backendProcess = null;
let activeBackendPort = 5000;
let isQuitting = false;
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

let logStream = null;
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        if (!logStream && app) {
            const userDataDir = app.getPath('userData');
            const logsDir = path.join(userDataDir, 'logs');
            fs.mkdirSync(logsDir, { recursive: true });
            logStream = fs.createWriteStream(path.join(logsDir, 'backend.log'), { flags: 'a' });
        }
        if (logStream) logStream.write(line);
    } catch (_) {}
    console.log(msg);
}

// Garantir instância única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.exit(0);
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    } else if (!isQuitting) {
        createWindow();
    }
});

function killProcessTreeSync(pid) {
    if (!pid) return;
    try {
        if (process.platform === 'win32') {
            execFileSync('taskkill', ['/pid', String(pid), '/f', '/t'], {
                windowsHide: true,
                stdio: 'ignore',
                timeout: 4000,
            });
        } else {
            process.kill(pid, 'SIGKILL');
        }
    } catch (_) {}
}

function getBackendPidFile() {
    try {
        return path.join(app.getPath('userData'), 'backend.pid');
    } catch (_) {
        return null;
    }
}

function cleanupOrphanBackend() {
    const pidFile = getBackendPidFile();
    if (!pidFile) return;
    try {
        if (fs.existsSync(pidFile)) {
            const raw = fs.readFileSync(pidFile, 'utf8').trim();
            const oldPid = parseInt(raw, 10);
            if (oldPid && oldPid !== process.pid) {
                log(`[Electron] Encerrando backend órfão anterior (PID ${oldPid})...`);
                killProcessTreeSync(oldPid);
            }
            fs.unlinkSync(pidFile);
        }
    } catch (_) {}
}

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


        cleanupOrphanBackend();
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
            windowsHide: true,
        });

        try {
            const pidFile = getBackendPidFile();
            if (pidFile && backendProcess.pid) {
                fs.writeFileSync(pidFile, String(backendProcess.pid), 'utf8');
            }
        } catch (_) {}

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

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levelNames = ['verbose', 'info', 'warning', 'error'];
        log(`[Renderer ${levelNames[level] || level}] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        log(`[Renderer ERR] did-fail-load: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`);
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                log('[Electron] Tentando recarregar mainWindow...');
                mainWindow.loadURL(`http://127.0.0.1:${activeBackendPort}`);
            }
        }, 1500);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
            mainWindow.webContents.reload();
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        log('[Electron] mainWindow carregou com sucesso.');
    });

    mainWindow.loadURL(`http://127.0.0.1:${activeBackendPort}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        isQuitting = true;
        mainWindow = null;
        for (const [, win] of whatsappWindows.entries()) {
            try {
                if (win && !win.isDestroyed()) win.destroy();
            } catch (_) {}
        }
        whatsappWindows.clear();
        killBackend();
        app.quit();
        setTimeout(() => {
            app.exit(0);
        }, 400);
    });
}

const signatureConfigs = new Map();

function generateWhatsappSignatureScript(cfg) {
    if (!cfg) return '';
    return `
(function() {
  window.__ATTENDANT_SIGNATURE_CONFIG = ${JSON.stringify(cfg)};
  if (window.__ATTENDANT_SIGNATURE_V2_INSTALLED) return;
  window.__ATTENDANT_SIGNATURE_V2_INSTALLED = true;
  window.__BYPASS_SIG_SEND = false;
  window.__SIG_IN_PROGRESS = false;

  function getComposer() {
    var selectors = [
      '#main footer div[contenteditable="true"][role="textbox"]',
      '#main footer div[contenteditable="true"][data-lexical-editor="true"]',
      '#main footer div[contenteditable="true"]',
      'footer div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][data-tab="10"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && !el.closest('#side') && el.getAttribute('data-tab') !== '3') {
        return el;
      }
    }
    var lexicalAll = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor="true"]');
    for (var j = 0; j < lexicalAll.length; j++) {
      var cand = lexicalAll[j];
      if (!cand.closest('#side') && cand.getAttribute('data-tab') !== '3') {
        return cand;
      }
    }
    return null;
  }

  function findSendButton(target) {
    if (!target || !target.closest) return null;
    return target.closest(
      'button[aria-label="Enviar"], ' +
      'button[aria-label="Send"], ' +
      'button[aria-label*="Enviar" i], ' +
      'button[data-tab="11"], ' +
      'span[data-icon="send"], ' +
      'span[data-icon="wds-ic-send-filled"]'
    );
  }

  function buildSignPlan(composer) {
    var config = window.__ATTENDANT_SIGNATURE_CONFIG;
    if (!config || !config.enabled || !config.name || !config.name.trim()) return null;

    var name = config.name.trim();
    var rawText = composer.innerText || composer.textContent || '';
    var cleanText = rawText.replace(/\\u200B/g, '').trim();
    if (!cleanText) return null;

    var prefix = '*[' + name + ']:* ';
    var prefixCheck = '[' + name + ']:';
    var suffixCheck = '~ Atendente ' + name;

    if (config.format === 'suffix') {
      if (cleanText.indexOf(suffixCheck) !== -1) return null;
      return { format: 'suffix', name: name, textToInsert: '_~ Atendente ' + name + '_' };
    } else {
      if (cleanText.indexOf(prefixCheck) !== -1 || cleanText.indexOf('*[') === 0) return null;
      return { format: 'prefix', name: name, textToInsert: prefix };
    }
  }

  function triggerNativeSignAndSend(e, composer) {
    if (window.__BYPASS_SIG_SEND) return;
    if (window.__SIG_IN_PROGRESS) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    var plan = buildSignPlan(composer);
    if (!plan) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.__SIG_IN_PROGRESS = true;
    setTimeout(function() { window.__SIG_IN_PROGRESS = false; }, 1500);

    try {
      composer.focus();
      var sel = window.getSelection();
      var range = document.createRange();
      var walker = document.createTreeWalker(composer, NodeFilter.SHOW_TEXT, null);

      if (plan.format === 'suffix') {
        var lastText = null;
        var n;
        while ((n = walker.nextNode())) lastText = n;
        if (lastText) {
          range.setStart(lastText, lastText.length);
          range.collapse(true);
        } else {
          range.selectNodeContents(composer);
          range.collapse(false);
        }
      } else {
        var firstText = walker.nextNode();
        if (firstText) {
          range.setStart(firstText, 0);
          range.collapse(true);
        } else {
          range.selectNodeContents(composer);
          range.collapse(true);
        }
      }

      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    console.debug('__WA_SIGN_SEND__:' + JSON.stringify(plan));
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var composer = getComposer();
      if (composer && (composer === e.target || composer.contains(e.target))) {
        triggerNativeSignAndSend(e, composer);
      }
    }
  }, true);

  ['pointerdown', 'mousedown', 'click'].forEach(function(evtName) {
    window.addEventListener(evtName, function(e) {
      var sendBtn = findSendButton(e.target);
      if (sendBtn) {
        var composer = getComposer();
        if (composer) {
          triggerNativeSignAndSend(e, composer);
        }
      }
    }, true);
  });
})();
`;
}

// Handler para abrir qualquer uma das 3 contas em janela dedicada destacável
ipcMain.handle('open-whatsapp-window', (event, { channelKey, label, signatureName, signatureEnabled, signatureFormat }) => {
    const safeKey = String(channelKey || 'atendimento_1').replace(/-/g, '_');
    const partitionName = `persist:whatsapp_${safeKey}`;
    const windowKey = safeKey;

    const signatureCfg = {
        name: signatureName || '',
        enabled: signatureEnabled !== false,
        format: signatureFormat || 'prefix'
    };
    signatureConfigs.set(windowKey, signatureCfg);

    if (whatsappWindows.has(windowKey)) {
        const existingWin = whatsappWindows.get(windowKey);
        if (existingWin && !existingWin.isDestroyed()) {
            if (existingWin.isMinimized()) existingWin.restore();
            existingWin.focus();
            existingWin.webContents.executeJavaScript(generateWhatsappSignatureScript(signatureCfg)).catch(() => {});
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

    const injectSignature = () => {
        const cfg = signatureConfigs.get(windowKey);
        if (cfg && !win.isDestroyed()) {
            win.webContents.executeJavaScript(generateWhatsappSignatureScript(cfg)).catch(() => {});
        }
    };

    win.webContents.on('dom-ready', injectSignature);
    win.webContents.on('did-finish-load', injectSignature);
    win.webContents.on('did-navigate-in-page', injectSignature);

    win.webContents.on('console-message', async (event, level, message) => {
        const msg = String(message || '');
        if (!msg.startsWith('__WA_SIGN_SEND__:')) return;
        try {
            const plan = JSON.parse(msg.slice('__WA_SIGN_SEND__:'.length));
            if (win.isDestroyed()) return;
            win.webContents.focus();

            if (plan.format === 'suffix') {
                win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] });
                win.webContents.sendInputEvent({ type: 'char', keyCode: 'Return', modifiers: ['shift'] });
                win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] });
                win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] });
                win.webContents.sendInputEvent({ type: 'char', keyCode: 'Return', modifiers: ['shift'] });
                win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] });
                await new Promise((r) => setTimeout(r, 25));
            }

            await win.webContents.insertText(plan.textToInsert);
            await new Promise((r) => setTimeout(r, 75));

            if (!win.isDestroyed()) {
                await win.webContents.executeJavaScript(`
                    window.__BYPASS_SIG_SEND = true;
                    window.__SIG_IN_PROGRESS = false;
                    (function() {
                        var c = document.querySelector('#main footer div[contenteditable="true"]') ||
                                document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]:not([data-tab="3"])');
                        if (c) c.focus();
                    })();
                `).catch(() => {});

                win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
                win.webContents.sendInputEvent({ type: 'char', keyCode: 'Return' });
                win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });

                setTimeout(() => {
                    if (!win.isDestroyed()) {
                        win.webContents.executeJavaScript('window.__BYPASS_SIG_SEND = false;').catch(() => {});
                    }
                }, 200);
            }
        } catch (_) {
            if (!win.isDestroyed()) {
                win.webContents.executeJavaScript('window.__SIG_IN_PROGRESS = false; window.__BYPASS_SIG_SEND = false;').catch(() => {});
            }
        }
    });

    win.loadURL('https://web.whatsapp.com', { userAgent: WHATSAPP_USER_AGENT });

    win.on('closed', () => {
        whatsappWindows.delete(windowKey);
    });

    whatsappWindows.set(windowKey, win);
    return { success: true, opened: true };
});

ipcMain.handle('update-whatsapp-signature', (event, { channelKey, signatureName, signatureEnabled, signatureFormat }) => {
    const safeKey = String(channelKey || 'atendimento_1').replace(/-/g, '_');
    const signatureCfg = {
        name: signatureName || '',
        enabled: signatureEnabled !== false,
        format: signatureFormat || 'prefix'
    };
    signatureConfigs.set(safeKey, signatureCfg);

    const win = whatsappWindows.get(safeKey);
    if (win && !win.isDestroyed()) {
        win.webContents.executeJavaScript(generateWhatsappSignatureScript(signatureCfg)).catch(() => {});
    }
    return { success: true };
});

function killBackend() {
    if (backendProcess) {
        const pid = backendProcess.pid;
        backendProcess = null;
        log(`[Electron] Encerrando backend e árvore de processos (PID ${pid})...`);
        killProcessTreeSync(pid);
    }
    try {
        const pidFile = getBackendPidFile();
        if (pidFile && fs.existsSync(pidFile)) {
            const raw = fs.readFileSync(pidFile, 'utf8').trim();
            const filePid = parseInt(raw, 10);
            if (filePid && filePid !== process.pid) {
                killProcessTreeSync(filePid);
            }
            fs.unlinkSync(pidFile);
        }
    } catch (_) {}
    try {
        if (logStream) {
            logStream.end();
            logStream = null;
        }
    } catch (_) {}
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
        killBackend();
        app.quit();
    }
});

app.on('window-all-closed', () => {
    isQuitting = true;
    killBackend();
    app.quit();
    setTimeout(() => app.exit(0), 400);
});

app.on('before-quit', () => {
    isQuitting = true;
    killBackend();
});

app.on('will-quit', () => {
    isQuitting = true;
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
