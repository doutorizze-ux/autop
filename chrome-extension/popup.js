/**
 * popup.js - interface de controle da extensao.
 * O popup e so uma janela: toda a logica roda no service worker (background.js)
 * e a comunicacao acontece por chrome.runtime.sendMessage.
 */

const backendUrlInput = document.getElementById('backendUrl');
const agentTokenInput = document.getElementById('agentToken');
const btnSave = document.getElementById('btnSave');
const btnRefresh = document.getElementById('btnRefresh');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const tasksCountEl = document.getElementById('tasksCount');
const lastPingEl = document.getElementById('lastPing');
const failedCountEl = document.getElementById('failedCount');
const errorBox = document.getElementById('errorBox');
const lastSupplierEl = document.getElementById('lastSupplier');

const tabConnection = document.getElementById('tabConnection');
const tabTest = document.getElementById('tabTest');
const viewConnection = document.getElementById('viewConnection');
const viewTest = document.getElementById('viewTest');

const testSupplierSelect = document.getElementById('testSupplier');
const testQueryInput = document.getElementById('testQuery');
const btnRunTest = document.getElementById('btnRunTest');
const testLoading = document.getElementById('testLoading');
const testResults = document.getElementById('testResults');

/* ------------------------------------------------------------------ *
 * Abas
 * ------------------------------------------------------------------ */

function activateTab(which) {
  const isTest = which === 'test';

  tabTest.classList.toggle('active', isTest);
  tabConnection.classList.toggle('active', !isTest);
  viewTest.classList.toggle('active', isTest);
  viewConnection.classList.toggle('active', !isTest);
}

tabConnection.addEventListener('click', () => activateTab('connection'));
tabTest.addEventListener('click', () => activateTab('test'));

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** sendMessage com Promise, tolerando o "port closed" quando a janela fecha. */
function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function updateUi(data) {
  if (!data) return;

  const config = data.config;
  const status = data.status;

  if (config) {
    backendUrlInput.value = config.backendUrl || '';
    if (agentTokenInput) {
      agentTokenInput.value = config.agentToken || '';
    }
  }

  if (status) {
    if (status.connected) {
      statusBadge.className = 'status-badge online';
      statusText.textContent = 'Online';
      errorBox.style.display = 'none';
    } else {
      statusBadge.className = 'status-badge offline';
      statusText.textContent = 'Offline';
      if (status.lastError) {
        errorBox.textContent = status.lastError;
        errorBox.style.display = 'block';
      } else {
        errorBox.style.display = 'none';
      }
    }

    tasksCountEl.textContent = status.tasksCompleted || 0;

    if (failedCountEl) {
      failedCountEl.textContent = status.tasksFailed || 0;
    }

    if (lastSupplierEl) {
      lastSupplierEl.textContent = status.lastSupplier || '--';
    }

    if (status.lastHeartbeat) {
      const seconds = Math.max(0, Math.round((Date.now() - status.lastHeartbeat) / 1000));
      lastPingEl.textContent = `${seconds}s atras`;
    } else {
      lastPingEl.textContent = '--';
    }
  }
}

async function fetchStatus() {
  const response = await send({ type: 'GET_STATUS' });
  updateUi(response);
}

/* ------------------------------------------------------------------ *
 * Conexao
 * ------------------------------------------------------------------ */

btnSave.addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim() || 'http://127.0.0.1:5000';
  const agentToken = agentTokenInput ? agentTokenInput.value.trim() : '';

  backendUrlInput.value = backendUrl;
  btnSave.textContent = 'Conectando...';
  btnSave.disabled = true;

  const response = await send({
    type: 'SAVE_CONFIG',
    payload: { backendUrl, agentToken },
  });

  btnSave.textContent = 'Salvar e Conectar';
  btnSave.disabled = false;

  updateUi(response);

  if (response && response.ok === false) {
    errorBox.textContent = (response.status && response.status.lastError)
      || 'Nao foi possivel conectar. O backend esta rodando?';
    errorBox.style.display = 'block';
  }
});

btnRefresh.addEventListener('click', async () => {
  btnRefresh.textContent = '...';
  await send({ type: 'RELOAD_EXTENSION' }).catch(() => {});
  setTimeout(() => {
    btnRefresh.textContent = 'Atualizar';
    fetchStatus();
  }, 500);
});

/* ------------------------------------------------------------------ *
 * Teste de busca
 * ------------------------------------------------------------------ */

/**
 * Os fornecedores vem do registro de perfis do service worker (fonte unica),
 * entao o teste usa exatamente os mesmos seletores da busca real.
 */
async function populateSuppliers() {
  const response = await send({ type: 'GET_PROFILES' });
  if (!response || !Array.isArray(response.profiles)) return;

  testSupplierSelect.innerHTML = response.profiles
    .map((profile) => `<option value="${profile.key}">${profile.name}</option>`)
    .join('');
}

btnRunTest.addEventListener('click', async () => {
  const query = testQueryInput.value.trim();
  const key = testSupplierSelect.value;

  if (!query) {
    testResults.innerHTML = '<div class="error-box">Digite um codigo ou nome de peca para testar.</div>';
    return;
  }

  testLoading.style.display = 'block';
  testResults.innerHTML = '';
  btnRunTest.disabled = true;

  const response = await send({ type: 'TEST_SEARCH', payload: { key, query } });

  testLoading.style.display = 'none';
  btnRunTest.disabled = false;

  if (!response || !response.success) {
    const message = (response && response.error) || 'Nenhum item retornado.';
    testResults.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
    return;
  }

  const items = response.results || [];
  if (items.length === 0) {
    testResults.innerHTML = '<div class="result-card">A busca rodou, mas nenhum produto com preco foi encontrado para este codigo.</div>';
    return;
  }

  testResults.innerHTML = items
    .map((item) => {
      const price = typeof item.price === 'number' ? item.price.toFixed(2) : item.price;
      const code = item.code || '--';
      const stock = item.stockText || (item.available === false ? 'Indisponivel' : 'Disponivel');

      return `
        <div class="result-card">
          <div class="result-header">
            <span>${escapeHtml(item.product || 'Produto')}</span>
            <span class="result-price">R$ ${escapeHtml(String(price))}</span>
          </div>
          <div><small>Cod: ${escapeHtml(String(code))} | Estoque: ${escapeHtml(String(stock))}</small></div>
        </div>
      `;
    })
    .join('');
});

/** Evita que o texto vindo do portal vire HTML na interface. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

populateSuppliers();
fetchStatus();

// O popup fica aberto enquanto o lojista observa; atualiza sozinho.
const refreshTimer = setInterval(async () => {
  await fetchStatus();
}, 3000);

window.addEventListener('unload', () => clearInterval(refreshTimer));