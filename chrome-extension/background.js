/**
 * background.js
 *
 * Service worker da extensao (Manifest V3).
 *
 * PAPEL: manter o vinculo com o backend, puxar tarefas, executa-las na aba real
 * do fornecedor (via chrome.scripting) e devolver o resultado.
 *
 * RESTRICAO CENTRAL DO MV3: este arquivo NAO tem DOM e o Chrome desliga o worker
 * quando fica ~30s sem evento. Por isso:
 *   - nada de DOMParser/document aqui: a leitura de pagina e feita por injecao;
 *   - o polling roda por chrome.alarms (que acorda o worker), e nao por
 *     setInterval, que o Chrome congela junto com o descanso do worker;
 *   - durante uma tarefa longa mantemos um alarme de keep-alive ativo.
 */

import {
  dispatchSupplierSearch,
  resolveProfile,
  supplierTabs,
  SUPPLIER_PROFILES,
} from './suppliers.js';

import {
  PAGE_getState,
  PAGE_click,
  PAGE_type,
  PAGE_press,
  PAGE_readWebStorage,
} from './page-functions.js';

/* ------------------------------------------------------------------ *
 * Configuracao
 * ------------------------------------------------------------------ */

const DEFAULT_CONFIG = {
  backendUrl: 'http://localhost:5000',
  agentToken: 'autopecas-agent-token',
  agentId: '',
  agentName: 'Agente Chrome - Loja',
  version: '2.1.0',
  enabled: true,
};

const HEARTBEAT_ALARM = 'autopecas_heartbeat';
const POLL_ALARM = 'autopecas_poll';
const KEEPALIVE_ALARM = 'autopecas_keepalive';

// O Chrome clampa periodInMinutes para no minimo 30s (0.5). Pedir menos nao
// acelera nada e ainda gera alarme recriado a cada boot do worker.
const HEARTBEAT_PERIOD_MINUTES = 0.5;
const POLL_PERIOD_MINUTES = 0.5;

let currentConfig = { ...DEFAULT_CONFIG };
let isProcessingTask = false;
let processingStartedAt = 0;
let pollCycle = 0;

const statusState = {
  connected: false,
  lastHeartbeat: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  lastError: null,
  lastSupplier: null,
  lastTaskKind: null,
  supportedSuppliers: SUPPLIER_PROFILES.length,
};

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseUrl() {
  return String(currentConfig.backendUrl || '').replace(/\/+$/, '');
}

function agentHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-local-agent-token': currentConfig.agentToken || 'autopecas-agent-token',
    'x-local-agent-id': currentConfig.agentId || 'chrome-ext',
  };
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'Erro desconhecido');
}

/** Corpo de identidade que acompanha heartbeat e polling. */
function agentIdentityBody() {
  return {
    agentId: currentConfig.agentId,
    agentName: currentConfig.agentName,
    version: currentConfig.version,
    // Vazio = aceita tarefas de qualquer fornecedor. O backend casa este filtro
    // contra id/nome/tipo do fornecedor, entao lista vazia evita excluir
    // fornecedores por diferenca de grafia no cadastro.
    supplierFilters: [],
  };
}

/**
 * POST com timeout. O fetch do service worker nao tem timeout proprio: sem
 * AbortController, um backend pendurado trava o worker para sempre.
 */
async function postJson(path, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: agentHeaders(),
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Persistencia / inicializacao
 * ------------------------------------------------------------------ */

async function initConfig() {
  const stored = await chrome.storage.local.get(['autopecas_config', 'autopecas_stats']);
  const storedConfig = stored.autopecas_config || {};

  currentConfig = { ...DEFAULT_CONFIG, ...storedConfig };

  // agentId estavel por instalacao: se mudasse a cada boot, o backend veria um
  // agente novo a cada reinicio do worker e tarefas ficariam presas em um id
  // que nunca mais aparece.
  if (!currentConfig.agentId) {
    currentConfig.agentId = `chrome-ext-${Math.random().toString(36).substring(2, 10)}`;
  }

  // localhost e 127.0.0.1 nao sao o mesmo servidor para o CORS: fixa um so.
  if (String(currentConfig.backendUrl || '').includes('localhost')) {
    currentConfig.backendUrl = String(currentConfig.backendUrl).replace('localhost', '127.0.0.1');
  }

  await chrome.storage.local.set({ autopecas_config: currentConfig });

  if (stored.autopecas_stats) {
    statusState.tasksCompleted = stored.autopecas_stats.tasksCompleted || 0;
    statusState.tasksFailed = stored.autopecas_stats.tasksFailed || 0;
  }

  console.log('[AutoPecas] Configuracao pronta:', currentConfig.backendUrl, currentConfig.agentId);
}

async function persistStats() {
  await chrome.storage.local.set({
    autopecas_stats: {
      tasksCompleted: statusState.tasksCompleted,
      tasksFailed: statusState.tasksFailed,
    },
  });
}

/**
 * Registra os alarmes uma unica vez.
 * Recriar alarme a cada boot do worker zera o ciclo e o polling nunca dispara.
 */
async function ensureAlarms() {
  const existing = await chrome.alarms.get(HEARTBEAT_ALARM).catch(() => null);
  if (!existing) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_PERIOD_MINUTES, delayInMinutes: 0.1 });
  }

  const pollExisting = await chrome.alarms.get(POLL_ALARM).catch(() => null);
  if (!pollExisting) {
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_PERIOD_MINUTES, delayInMinutes: 0.2 });
  }
}

/**
 * Mantem o worker vivo enquanto uma tarefa roda.
 * A tarefa e uma cadeia longa de awaits; sem evento, o Chrome poderia encerrar o
 * worker no meio e a tarefa ficaria sem resposta ate o timeout do backend.
 */
async function startKeepAlive() {
  const existing = await chrome.alarms.get(KEEPALIVE_ALARM).catch(() => null);
  if (!existing) {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5, delayInMinutes: 0.1 });
  }
}

async function stopKeepAlive() {
  await chrome.alarms.clear(KEEPALIVE_ALARM).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Conexao com o backend
 * ------------------------------------------------------------------ */

async function sendHeartbeat() {
  if (!currentConfig.enabled || !currentConfig.backendUrl) return false;

  try {
    const response = await postJson('/api/local-agent/heartbeat', agentIdentityBody(), 10000);

    if (!response.ok) {
      statusState.connected = false;
      statusState.lastError = `Backend respondeu HTTP ${response.status}.`;
      return false;
    }

    statusState.connected = true;
    statusState.lastHeartbeat = Date.now();
    statusState.lastError = null;
    return true;
  } catch (error) {
    statusState.connected = false;
    const message = errorMessage(error);
    statusState.lastError = message.includes('aborted')
      ? 'Tempo esgotado ao falar com o backend. Ele esta rodando na porta 5000?'
      : `Sem conexao com o backend: ${message}`;
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Fila de tarefas
 * ------------------------------------------------------------------ */

/**
 * Puxa a proxima tarefa e a executa.
 *
 * ATENCAO: o backend devolve a tarefa com os campos do payload ACHATADOS
 * (`{ id, kind, supplier, productName }`), porque faz `{ id, ...task.payload }`.
 * Ler `task.payload.kind` (como fazia a versao anterior) sempre dava undefined,
 * e por isso nenhuma tarefa era executada.
 */
async function pollNextTask() {
  if (!currentConfig.enabled || !currentConfig.backendUrl) return;
  if (isProcessingTask) return;
  if (!statusState.connected) {
    // Sem heartbeat recente nao ha tarefa elegivel no backend.
    return;
  }

  let task = null;

  // Alterna o tipo pedido a cada ciclo. Pedir sempre 'search' deixaria as
  // tarefas de Login Assistido presas na fila ate o timeout de 120s; pedir
  // sempre 'any' faria o backend priorizar sessao e a cotacao esperar. A
  // alternancia da prioridade aos dois sem starvation.
  pollCycle += 1;
  const wantedKind = pollCycle % 3 === 0 ? 'any' : 'search';

  try {
    const response = await postJson('/api/local-agent/tasks/next', {
      ...agentIdentityBody(),
      preferredKind: wantedKind,
    }, 10000);

    if (!response.ok) return;

    const data = await response.json();
    task = data ? data.task : null;
  } catch (_) {
    return;
  }

  if (!task || !task.id) return;

  isProcessingTask = true;
  processingStartedAt = Date.now();
  await startKeepAlive();

  try {
    if (task.kind === 'search') {
      statusState.lastTaskKind = 'search';
      statusState.lastSupplier = task.supplier ? task.supplier.name : null;
      await handleSearchTask(task);
    } else if (task.kind === 'supplier-session') {
      statusState.lastTaskKind = 'supplier-session';
      statusState.lastSupplier = task.supplier ? task.supplier.name : null;
      await handleSessionTask(task);
    } else {
      await failTask(task.id, `Tipo de tarefa desconhecido: ${task.kind}`);
    }
  } catch (error) {
    await failTask(task.id, errorMessage(error));
  } finally {
    isProcessingTask = false;
    processingStartedAt = 0;
    await stopKeepAlive();
  }
}

async function completeTask(taskId, result) {
  try {
    const response = await postJson(`/api/local-agent/tasks/${taskId}/complete`, { result }, 30000);
    if (!response.ok) {
      throw new Error(`Backend recusou a conclusao (HTTP ${response.status}).`);
    }
    statusState.tasksCompleted += 1;
    await persistStats();
  } catch (error) {
    statusState.lastError = `Falha ao enviar resultado: ${errorMessage(error)}`;
    throw error;
  }
}

async function failTask(taskId, message) {
  statusState.tasksFailed += 1;
  statusState.lastError = message;
  await persistStats();

  try {
    await postJson(`/api/local-agent/tasks/${taskId}/fail`, { error: message }, 15000);
  } catch (_) {
    // Backend ja deu timeout nessa tarefa: nada a fazer.
  }
}

/* ------------------------------------------------------------------ *
 * Tarefa de busca
 * ------------------------------------------------------------------ */

async function handleSearchTask(task) {
  const supplier = task.supplier;
  const productName = task.productName;

  if (!supplier || !productName) {
    await failTask(task.id, 'Tarefa de busca sem fornecedor ou produto.');
    return;
  }

  try {
    const items = await dispatchSupplierSearch(supplier, productName, task.id);
    console.log(`[AutoPecas] ${supplier.name}: ${items.length} item(ns) para "${productName}".`);
    await completeTask(task.id, items);
  } catch (error) {
    // Repassa a mensagem real (login necessario, layout mudado, timeout) para o
    // painel mostrar algo acionavel em vez de um erro generico.
    await failTask(task.id, errorMessage(error));
  }
}

/* ------------------------------------------------------------------ *
 * Login Assistido (tarefa supplier-session)
 * ------------------------------------------------------------------ */

const sessionTabs = new Map(); // supplierKey -> tabId

function supplierKeyOf(supplier) {
  const profile = resolveProfile(supplier);
  return profile.key;
}

async function getSessionTab(supplier) {
  const key = supplierKeyOf(supplier);
  const tabId = sessionTabs.get(key);
  if (tabId == null) return null;

  try {
    const tab = await chrome.tabs.get(tabId);
    return tab || null;
  } catch (_) {
    sessionTabs.delete(key);
    return null;
  }
}

async function openSessionTab(supplier) {
  const existing = await getSessionTab(supplier);
  if (existing && existing.id != null) return existing;

  const profile = resolveProfile(supplier);
  const target = supplier.loginUrl || supplier.url || profile.startUrl;

  const tab = await chrome.tabs.create({ url: target, active: false });
  if (tab && tab.id != null) {
    sessionTabs.set(supplierKeyOf(supplier), tab.id);
  }
  return tab;
}

/** Espera a aba carregar, com teto de tempo. */
async function waitForTabLoad(tabId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let tab = null;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {
      return false;
    }
    if (tab && tab.status === 'complete') return true;
    await sleep(300);
  }
  return false;
}

/**
 * Captura a imagem da aba.
 * chrome.tabs.captureVisibleTab so enxerga a aba ATIVA da janela, entao
 * ativamos a aba do fornecedor por um instante e devolvemos o foco para a aba
 * que o lojista estava usando.
 */
async function captureTabImage(tabId) {
  const tab = await chrome.tabs.get(tabId);

  let previouslyActiveId = null;
  try {
    const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active && active[0]) previouslyActiveId = active[0].id;
  } catch (_) {}

  if (previouslyActiveId !== tabId) {
    await chrome.tabs.update(tabId, { active: true });
    await sleep(350);
  }

  let dataUrl = null;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 45,
    });
  } catch (error) {
    // Sem foco de janela (Chrome minimizado, por exemplo) a captura falha.
    console.warn('[AutoPecas] Nao foi possivel capturar a tela da aba:', errorMessage(error));
  } finally {
    if (previouslyActiveId != null && previouslyActiveId !== tabId) {
      try {
        await chrome.tabs.update(previouslyActiveId, { active: true });
      } catch (_) {}
    }
  }

  return dataUrl;
}

async function sessionSnapshot(supplier) {
  const tab = await getSessionTab(supplier);
  if (!tab || tab.id == null) {
    throw new Error('Login Assistido nao iniciado para este fornecedor.');
  }

  const [image, state] = await Promise.all([
    captureTabImage(tab.id),
    injectInto(tab.id, PAGE_getState, []).catch(() => null),
  ]);

  const fresh = await chrome.tabs.get(tab.id).catch(() => tab);

  return {
    image: image || null,
    url: (state && state.url) || fresh.url || '',
    title: (state && state.title) || fresh.title || '',
    dpr: state ? state.dpr : 1,
  };
}

async function injectInto(tabId, func, args = [], world = 'ISOLATED') {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: func,
    args: args,
    world: world,
  });

  if (!results || results.length === 0) return null;
  return results[0].result;
}

/**
 * Le os cookies do dominio para salvar a sessao autenticada.
 * O formato imita o storageState do Playwright ({ cookies, origins }), que e o
 * que o backend ja grava no campo sessionData do fornecedor.
 */
async function buildStorageState(supplier, tabUrl) {
  const targetUrl = tabUrl || supplier.url || supplier.loginUrl;
  let cookies = [];

  try {
    cookies = await chrome.cookies.getAll({ url: targetUrl });
  } catch (_) {
    cookies = [];
  }

  if (cookies.length === 0 && supplier.url) {
    try {
      cookies = await chrome.cookies.getAll({ url: supplier.url });
    } catch (_) {
      cookies = [];
    }
  }

  return {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate || -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: cookie.sameSite || 'Unspecified',
    })),
    origins: [],
  };
}

async function handleSessionTask(task) {
  const supplier = task.supplier;
  const action = task.action;
  const payload = task.payload || {};

  if (!supplier) {
    await failTask(task.id, 'Tarefa de sessao sem fornecedor.');
    return;
  }

  const label = supplier.name || 'fornecedor';

  try {
    switch (action) {
      case 'start': {
        const tab = await openSessionTab(supplier);
        if (!tab || tab.id == null) {
          throw new Error('Nao foi possivel abrir a aba do portal.');
        }
        await waitForTabLoad(tab.id);
        await sleep(800); // dar tempo ao primeiro render do portal
        await completeTask(task.id, await sessionSnapshot(supplier));
        return;
      }

      case 'snapshot': {
        await completeTask(task.id, await sessionSnapshot(supplier));
        return;
      }

      case 'click': {
        const tab = await getSessionTab(supplier);
        if (!tab || tab.id == null) throw new Error('Login Assistido nao iniciado para este fornecedor.');

        // O painel manda coordenadas na escala da IMAGEM capturada; se o monitor
        // tiver escala (HiDPI), e preciso voltar para a escala CSS da pagina.
        const state = await injectInto(tab.id, PAGE_getState, []).catch(() => null);
        const dpr = state && state.dpr ? state.dpr : 1;

        const x = Math.round(Number(payload.x || 0) / dpr);
        const y = Math.round(Number(payload.y || 0) / dpr);

        await injectInto(tab.id, PAGE_click, [x, y]);
        await sleep(500);
        await completeTask(task.id, await sessionSnapshot(supplier));
        return;
      }

      case 'type': {
        const tab = await getSessionTab(supplier);
        if (!tab || tab.id == null) throw new Error('Login Assistido nao iniciado para este fornecedor.');

        const outcome = await injectInto(tab.id, PAGE_type, [String(payload.text || '')]);
        if (!outcome || !outcome.ok) {
          throw new Error(
            'Nenhum campo de texto esta focado na pagina. Clique no campo antes de digitar.'
          );
        }

        await sleep(300);
        await completeTask(task.id, await sessionSnapshot(supplier));
        return;
      }

      case 'press': {
        const tab = await getSessionTab(supplier);
        if (!tab || tab.id == null) throw new Error('Login Assistido nao iniciado para este fornecedor.');

        await injectInto(tab.id, PAGE_press, [String(payload.key || 'Enter')]);
        await sleep(600);
        await completeTask(task.id, await sessionSnapshot(supplier));
        return;
      }

      case 'save': {
        const tab = await getSessionTab(supplier);
        const tabUrl = tab ? tab.url : null;

        const [storageState, webStorage] = await Promise.all([
          buildStorageState(supplier, tabUrl),
          tab && tab.id != null
            ? injectInto(tab.id, PAGE_readWebStorage, []).catch(() => null)
            : null,
        ]);

        if (webStorage && webStorage.origin && storageState.origins.length === 0) {
          storageState.origins = [{
            origin: webStorage.origin,
            localStorage: (webStorage.localStorage || []).map((entry) => ({
              name: entry.name,
              value: entry.value,
            })),
          }];
        }

        if (storageState.cookies.length === 0) {
          throw new Error(
            `Nenhum cookie encontrado para ${label}. Confirme que a pagina do portal esta aberta e que o login foi concluido.`
          );
        }

        await completeTask(task.id, {
          saved: true,
          storageState: storageState,
          profilePath: null,
          url: tabUrl || supplier.url || '',
          cookieCount: storageState.cookies.length,
        });
        return;
      }

      case 'stop': {
        const key = supplierKeyOf(supplier);
        const tabId = sessionTabs.get(key);

        if (tabId != null) {
          sessionTabs.delete(key);
          try {
            await chrome.tabs.remove(tabId);
          } catch (_) {
            // aba ja fechada pelo lojista
          }
        }

        await completeTask(task.id, { stopped: true, mode: 'chrome-extension' });
        return;
      }

      default:
        await failTask(task.id, `Acao de sessao desconhecida: ${action}`);
    }
  } catch (error) {
    await failTask(task.id, errorMessage(error));
  }
}

/* ------------------------------------------------------------------ *
 * Alarmes
 * ------------------------------------------------------------------ */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    sendHeartbeat();
    return;
  }

  if (alarm.name === POLL_ALARM) {
    pollNextTask();
    return;
  }

  if (alarm.name === KEEPALIVE_ALARM) {
    // Toque no proprio worker: um evento recente impede o Chrome de descansa-lo
    // no meio de uma tarefa longa.
    chrome.runtime.getPlatformInfo().catch(() => {});
  }
});

/* ------------------------------------------------------------------ *
 * Mensagens do popup
 * ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || !request.type) return false;

  if (request.type === 'GET_STATUS') {
    sendResponse({ config: currentConfig, status: statusState });
    return true;
  }

  if (request.type === 'GET_PROFILES') {
    sendResponse({
      profiles: SUPPLIER_PROFILES.map((profile) => ({
        key: profile.key,
        name: profile.name,
        hosts: profile.hosts,
        openTabs: supplierTabs.has(profile.key),
      })),
    });
    return true;
  }

  if (request.type === 'SAVE_CONFIG') {
    let rawUrl = String((request.payload && request.payload.backendUrl) || currentConfig.backendUrl).trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = `http://${rawUrl}`;
    }
    if (rawUrl.includes('localhost')) {
      rawUrl = rawUrl.replace('localhost', '127.0.0.1');
    }

    currentConfig = {
      ...currentConfig,
      ...request.payload,
      backendUrl: rawUrl.replace(/\/+$/, ''),
      agentToken: (request.payload && request.payload.agentToken) || currentConfig.agentToken,
    };

    chrome.storage.local.set({ autopecas_config: currentConfig });

    sendHeartbeat()
      .then((ok) => {
        sendResponse({ config: currentConfig, status: statusState, ok: ok });
      })
      .catch((error) => {
        statusState.connected = false;
        statusState.lastError = errorMessage(error);
        sendResponse({ config: currentConfig, status: statusState, ok: false });
      });

    return true; // resposta assincrona
  }

  if (request.type === 'CLOSE_SUPPLIER_TAB') {
    const key = String((request.payload && request.payload.key) || '');
    const tabId = supplierTabs.get(key);

    if (tabId == null) {
      sendResponse({ closed: false, reason: 'nenhuma aba aberta' });
      return true;
    }

    supplierTabs.delete(key);
    chrome.tabs.remove(tabId)
      .then(() => sendResponse({ closed: true }))
      .catch(() => sendResponse({ closed: false }));
    return true;
  }

  if (request.type === 'TEST_SEARCH') {
    const payload = request.payload || {};
    const supplier = {
      id: payload.key || 'test',
      name: payload.name || 'Fornecedor teste',
      url: payload.url || '',
      searchUrl: payload.searchUrl || '',
      searchBarSelector: payload.searchBarSelector || '',
      searchBtnSelector: payload.searchBtnSelector || '',
    };

    dispatchSupplierSearch(supplier, String(payload.query || ''), null)
      .then((results) => sendResponse({ success: true, results: results }))
      .catch((error) => sendResponse({ success: false, error: errorMessage(error) }));

    return true; // resposta assincrona
  }

  if (request.type === 'RELOAD_EXTENSION') {
    sendResponse({ ok: true });
    setTimeout(() => chrome.runtime.reload(), 100);
    return true;
  }

  return false;
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

initConfig()
  .then(() => ensureAlarms())
  .then(() => sendHeartbeat())
  .catch((error) => {
    console.error('[AutoPecas] Falha na inicializacao:', errorMessage(error));
  });

// Se o worker for acordado por um evento qualquer depois de um descanso,
// garante que a conexao e os alarmes continuam de pe.
chrome.runtime.onStartup.addListener(() => {
  ensureAlarms().then(() => sendHeartbeat()).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms().then(() => sendHeartbeat()).catch(() => {});
});