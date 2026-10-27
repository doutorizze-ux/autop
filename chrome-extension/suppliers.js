/**
 * suppliers.js
 *
 * Registro de fornecedores e orquestracao da busca.
 *
 * ESTE ARQUIVO RODA NO SERVICE WORKER (Manifest V3), portanto NAO tem DOM.
 * Toda leitura de pagina acontece em page-functions.js, injetado na aba do
 * fornecedor via chrome.scripting. Aqui so vive: configuracao por portal,
 * navegacao da aba, espera de renderizacao e normalizacao do que volta.
 *
 * A ESTRATEGIA, EM ORDEM DE VELOCIDADE:
 *   1. Replay do endpoint interno que a propria SPA usa (aprendido pelo
 *      page-hook) -> same-origin, com os cookies do lojista, ~300ms.
 *   2. Busca por URL quando o portal aceita o termo na query string.
 *   3. Preencher o campo de busca dentro da pagina (SPA sem URL de busca).
 * Depois de (2) ou (3), extrai o DOM ja renderizado.
 */

import {
  PAGE_probe,
  PAGE_extract,
  PAGE_runSearch,
  PAGE_readLearnedEndpoints,
  PAGE_replayEndpoint,
  PAGE_autoLogin,
} from './page-functions.js';

/* ------------------------------------------------------------------ *
 * Configuracao por fornecedor
 * ------------------------------------------------------------------ */

/**
 * `background: false` deixa a aba em segundo plano (nao rouba o foco do
 * lojista). `keepTab: true` mantem a aba viva entre cotacoes: o portal continua
 * logado e a SPA nao precisa recarregar, que e o que torna a segunda busca
 * instantanea.
 */
export const SUPPLIER_PROFILES = [
  {
    key: 'rmp',
    match: ['real moto', 'rmp'],
    hosts: ['rmp.com.br'],
    name: 'Real Moto Pecas (RMP)',
    startUrl: 'https://www.rmp.com.br/',
    buildUrl: (query) => `https://www.rmp.com.br/catalogsearch/result/?q=${encodeURIComponent(query)}`,
    searchInputSel: '#search-cod-fab-input, #minisearch-input-top-search, input[name="q"]',
    searchButtonSel: 'button.btn-search-fab-cod, button[type="submit"]',
    containerSel: 'li.item.product.product-item, .product-item, .products .item',
    nameSel: '.product-item-name a, .product-item-link, .product-name',
    priceSel: '.price-box .price, .special-price .price, .regular-price .price, .price',
    keepTab: true,
  },
  {
    key: 'dpk',
    match: ['dpk'],
    hosts: ['dpk.com.br'],
    name: 'DPK',
    startUrl: 'https://www.dpk.com.br/#/busca-produto',
    // DPK e Angular: o fragmento (#/rota) nao vai ao servidor, entao query
    // string nao serve. Busca pelo campo, dentro da pagina.
    buildUrl: null,
    searchInputSel: 'input[formcontrolname="descricao"], input[placeholder*="produto" i], input[placeholder*="busca" i]',
    searchButtonSel: 'button.btn-buscar',
    containerSel: 'div.card-produto, div.produto-item, [class*="produto"]',
    nameSel: '.titulo-produto, h3, .nome',
    priceSel: '.preco-produto, .valor, [class*="preco"]',
    keepTab: true,
  },
  {
    key: 'kki',
    match: ['auto norte', 'kki'],
    hosts: ['autonorte.com.br'],
    name: 'Auto Norte (KKI)',
    startUrl: 'https://kki.autonorte.com.br/compras',
    buildUrl: (query) => `https://kki.autonorte.com.br/compras?pesquisa=${encodeURIComponent(query)}`,
    searchInputSel: 'input[placeholder*="pesquisar" i], input[type="search"]',
    searchButtonSel: 'button[type="submit"]',
    containerSel: 'div[class*="jay046"], div.produto, [class*="product"]',
    nameSel: 'p[class*="rhqd7b"], h3, strong, .nome',
    priceSel: 'span[class*="preco"], .preco, button',
    keepTab: true,
  },
  {
    key: 'comdip',
    match: ['comdip'],
    hosts: ['comdip.com.br'],
    name: 'Comdip',
    startUrl: 'https://portalcomdip.com.br/comdip/compras',
    buildUrl: (query) => `https://portalcomdip.com.br/comdip/compras/pesquisa/termo-busca/${encodeURIComponent(query.toLowerCase())}/1`,
    searchInputSel: 'input[type="search"], .search-input, input[placeholder*="busca" i]',
    searchButtonSel: 'button[type="submit"]',
    containerSel: '[class*="produto"], [class*="item"], article, tr',
    nameSel: 'h2, h3, h4, a, strong',
    priceSel: '.price, .valor, [class*="preco"]',
    keepTab: true,
  },
  {
    key: 'sky',
    match: ['sky'],
    hosts: ['skypecas.com.br'],
    name: 'Sky Pecas',
    startUrl: 'https://cliente.skypecas.com.br/produtos',
    buildUrl: null,
    searchInputSel: '#txtBusca, input[placeholder*="c[oo]digo" i], input[type="search"]',
    searchButtonSel: '#btnBuscar',
    containerSel: '.item-produto, .card-produto, [class*="produto"]',
    nameSel: '.titulo, h3, h4, .descricao',
    priceSel: '.preco, .valor, [class*="price"]',
    keepTab: true,
  },
  {
    key: 'kaizen',
    match: ['kaizen'],
    hosts: ['kaizenautopecas.com.br'],
    name: 'Kaizen Auto Pecas',
    startUrl: 'https://portal.kaizenautopecas.com.br/principal',
    buildUrl: null,
    searchInputSel: 'input[placeholder*="c[oo]digo" i], input[placeholder*="produto" i], input[type="search"]',
    searchButtonSel: '',
    containerSel: '.produto-card, [class*="produto"], .item-resultado, tr[data-produto]',
    nameSel: '.nome, .descricao, h3, h4, td.descricao',
    priceSel: '.preco, .valor, td.preco, [class*="preco"]',
    keepTab: true,
  },
  {
    key: 'furacao',
    match: ['furacao', 'sav'],
    hosts: ['furacao.com.br'],
    name: 'Furacao Auto Pecas',
    startUrl: 'https://vendas.furacao.com.br/vendas/sav/produtos',
    buildUrl: null,
    searchInputSel: 'input#gsearch, input[placeholder*="busca" i], input[type="search"]',
    searchButtonSel: '',
    containerSel: 'div.prod-container, .product-box, [class*="prod"]',
    nameSel: 'div.prod-descricao, .product-title, h3',
    priceSel: 'div.prod-preco, .product-price, [class*="preco"]',
    keepTab: true,
  },
];

/** Configuracao generica para fornecedor cadastrado pelo usuario. */
function buildGenericProfile(supplier) {
  const url = String(supplier?.url || '').trim();
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch (_) {
    host = '';
  }

  const searchUrl = String(supplier?.searchUrl || '').trim();

  return {
    key: `generic:${supplier?.id || host || 'custom'}`,
    match: [],
    hosts: host ? [host] : [],
    name: String(supplier?.name || 'Fornecedor'),
    startUrl: url || searchUrl,
    buildUrl: searchUrl
      ? (query) => {
        const withValue = searchUrl
          .replace(/\{query\}|\{termo\}|\{termo-busca\}|\{codigo\}/gi, encodeURIComponent(query));
        if (withValue !== searchUrl) return withValue;
        return `${searchUrl}${searchUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;
      }
      : null,
    searchInputSel: supplier?.searchBarSelector || '',
    searchButtonSel: supplier?.searchBtnSelector || '',
    containerSel: supplier?.itemContainerSelector || '.product-item, .item, [class*="product"], [class*="produto"], article',
    nameSel: supplier?.productNameSelector || 'h2, h3, .name, .nome, [class*="name"]',
    priceSel: supplier?.priceSelector || '.price, .preco, [class*="price"], [class*="preco"], .valor',
    keepTab: true,
  };
}

/** Acha o perfil do fornecedor: por nome/dominio conhecido, senao generico. */
export function resolveProfile(supplier) {
  const name = String(supplier?.name || '').toLowerCase();
  const url = String(supplier?.url || '').toLowerCase();

  for (const profile of SUPPLIER_PROFILES) {
    const matched = profile.match.some((token) => name.includes(token))
      || profile.hosts.some((host) => url.includes(host));
    if (matched) {
      return { ...profile, key: profile.key };
    }
  }

  return buildGenericProfile(supplier);
}

/* ------------------------------------------------------------------ *
 * Controle da aba do fornecedor
 * ------------------------------------------------------------------ */

const taskTabs = new Map();    // taskId -> tabId
const supplierTabs = new Map(); // supplierKey -> tabId (abas reaproveitadas)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

/** Descobre se a aba ja esta no dominio do fornecedor. */
function tabMatchesProfile(tab, profile) {
  if (!tab || !tab.url) return false;
  const host = hostFromUrl(tab.url);
  if (!host) return false;
  return profile.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (_) {
    return null;
  }
}

/**
 * Devolve uma aba pronta no dominio do fornecedor.
 * Reaproveita a aba que ja existe (portal logado, SPA aquecida) em vez de abrir
 * uma nova a cada cotacao: e o que evita tanto o acumulo de abas quanto o
 * recarregamento lento do login.
 */
let workerWindowId = null;

/**
 * Garante uma janela de segundo plano minimizada para isolar as abas dos fornecedores.
 * Dessa forma, as telas dos fornecedores rodam 100% silenciosas sem abrir abas na janela de trabalho do lojista.
 */
async function getWorkerWindow() {
  if (workerWindowId != null) {
    try {
      const win = await chrome.windows.get(workerWindowId);
      if (win) return win;
    } catch (_) {
      workerWindowId = null;
    }
  }

  try {
    const win = await chrome.windows.create({
      url: 'about:blank',
      state: 'minimized',
      focused: false,
      type: 'popup',
      width: 1024,
      height: 768,
    });
    workerWindowId = win.id;
    return win;
  } catch (err) {
    console.warn('[AutoPecas] Fallback: nao foi possivel criar janela popup minimizada:', err);
    return null;
  }
}

async function ensureTab(profile, taskId) {
  const knownId = supplierTabs.get(profile.key);
  if (knownId) {
    const existing = await getTab(knownId);
    if (existing && tabMatchesProfile(existing, profile)) {
      taskTabs.set(taskId, existing.id);
      return existing;
    }
    supplierTabs.delete(profile.key);
  }

  // Procura uma aba ja aberta pelo lojista nesse portal
  let candidates = [];
  try {
    candidates = await chrome.tabs.query({});
  } catch (_) {
    candidates = [];
  }

  const reused = candidates.find((tab) => tabMatchesProfile(tab, profile));
  if (reused && reused.id != null) {
    supplierTabs.set(profile.key, reused.id);
    taskTabs.set(taskId, reused.id);
    return reused;
  }

  // Cria a aba dentro da janela minimizada em segundo plano
  const workerWin = await getWorkerWindow();
  let created = null;

  if (workerWin && workerWin.id != null) {
    try {
      // Reutiliza aba about:blank inicial da janela minimizada se houver
      const winTabs = await chrome.tabs.query({ windowId: workerWin.id });
      const blankTab = winTabs.find((t) => t.url === 'about:blank' || t.url?.startsWith('chrome://'));
      if (blankTab && blankTab.id != null) {
        created = await chrome.tabs.update(blankTab.id, {
          url: profile.startUrl || 'about:blank',
          active: false,
        });
      } else {
        created = await chrome.tabs.create({
          windowId: workerWin.id,
          url: profile.startUrl || 'about:blank',
          active: false,
        });
      }
    } catch (_) {
      created = null;
    }
  }

  // Fallback caso a API de janelas falhe
  if (!created || created.id == null) {
    created = await chrome.tabs.create({
      url: profile.startUrl || 'about:blank',
      active: false,
    });
  }

  if (created && created.id != null) {
    supplierTabs.set(profile.key, created.id);
    taskTabs.set(taskId, created.id);
  }

  return created;
}

/** Espera a aba terminar de carregar (com teto de tempo). */
async function waitForLoad(tabId, timeoutMs = 30000) {
  const tab = await getTab(tabId);
  if (tab && tab.status === 'complete') return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(300);
    const current = await getTab(tabId);
    if (!current) return false;
    if (current.status === 'complete') return true;
  }

  return false;
}

/** Roda uma funcao injetada na aba, tratando aba fechada no meio do caminho. */
async function inject(tabId, func, args = [], world = 'ISOLATED') {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: func,
      args: args,
      world: world,
    });
    if (!results || results.length === 0) return null;
    return results[0].result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao executar na pagina: ${message}`);
  }
}

/* ------------------------------------------------------------------ *
 * Estrategias de busca
 * ------------------------------------------------------------------ */

/**
 * Troca o termo de busca em todos os pares de parametro da URL.
 * Um replace de parametro unico quebra em URLs com mais de uma query string.
 */
function replaceQueryParams(url, query) {
  const encoded = encodeURIComponent(query);
  let changed = false;

  const next = String(url || '').replace(/([?&][^=&]+=)([^&]*)/g, (full, prefix, value) => {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch (_) {}

    // Substitui apenas parametros que parecem carregar o termo (nao ids/tokens).
    if (decoded.length < 2) return full;
    if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(decoded)) return full;
    if (/^\d+$/.test(decoded)) return full;

    changed = true;
    return `${prefix}${encoded}`;
  });

  return changed ? next : null;
}

/**
 * Estrategia 1 (mais rapida): repetir a chamada interna que o portal faz.
 * So roda depois que o site ja navegou sozinho ao menos uma vez, para que o
 * page-hook tenha aprendido a rota real.
 */
async function tryLearnedEndpoint(tabId, query) {
  let learned = [];
  try {
    learned = await inject(tabId, PAGE_readLearnedEndpoints, []);
  } catch (_) {
    return null;
  }

  if (!Array.isArray(learned) || learned.length === 0) return null;

  // Prefere POST (a maioria das buscas de portal) e rotas que citam busca/produto.
  const ranked = learned
    .filter((entry) => entry && entry.url)
    .map((entry) => {
      let score = 0;
      if (String(entry.method).toUpperCase() === 'POST') score += 2;
      if (/busca|pesquisa|search/i.test(entry.url)) score += 3;
      if (/produto|catalog|estoque/i.test(entry.url)) score += 2;
      if (entry.body && String(entry.body).includes('__QUERY__')) score += 3;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const item of ranked) {
    try {
      const outcome = await inject(
        tabId,
        PAGE_replayEndpoint,
        [item.entry, query],
        'MAIN' // a chamada precisa sair do contexto da pagina, nao do mundo isolado
      );

      if (outcome && outcome.ok && outcome.data) {
        const normalized = normalizeEndpointPayload(outcome.data);
        if (normalized.length > 0) {
          return normalized;
        }
      }
    } catch (_) {
      // endpoint mudou ou exigiu outro cabecalho: segue para a proxima estrategia
    }
  }

  return null;
}

/**
 * Converte o JSON cru do endpoint interno no contrato do backend.
 * Como cada portal nomeia os campos de um jeito, varremos o objeto procurando
 * o primeiro array de objetos que tenha cara de produto.
 */
function normalizeEndpointPayload(data) {
  const productArrays = [];

  const walk = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      if (node.length > 0 && node[0] && typeof node[0] === 'object' && !Array.isArray(node[0])) {
        productArrays.push(node);
      } else {
        node.slice(0, 5).forEach((child) => walk(child, depth + 1));
      }
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node)) {
        walk(value, depth + 1);
      }
    }
  };

  walk(data, 0);
  if (productArrays.length === 0) return [];

  const pick = (item, names) => {
    for (const name of names) {
      const value = item[name];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return '';
  };

  const best = productArrays.sort((a, b) => b.length - a.length)[0];

  return best
    .map((item) => {
      const rawPrice = pick(item, [
        'preco', 'precoVenda', 'preco_venda', 'valor', 'vlrVenda', 'price', 'valorVenda', 'precoFinal',
      ]);
      const price = parsePriceValue(rawPrice);
      if (!price) return null;

      const name = String(pick(item, [
        'descricao', 'descricaoProduto', 'nome', 'nomeProduto', 'produto', 'titulo', 'description',
      ]) || '').trim();
      if (!name) return null;

      const stock = pick(item, ['saldoEstoque', 'estoque', 'saldo', 'qtdEstoque', 'quantidade', 'stock']);
      const stockNumber = Number.parseInt(String(stock).replace(/\D+/g, ''), 10);

      return {
        product: name,
        price: price,
        available: true,
        link: '',
        stock: Number.isFinite(stockNumber) ? stockNumber : 0,
        stockText: String(stock || ''),
        code: String(pick(item, ['codigo', 'codigoFabricante', 'codigoProduto', 'cod', 'sku', 'referencia', 'codigoOriginal']) || '').trim(),
        brand: String(pick(item, ['marca', 'fabricante', 'brand', 'marcaNome']) || '').trim(),
        application: String(pick(item, ['aplicacao', 'aplicacaoProduto', 'application']) || '').trim(),
      };
    })
    .filter(Boolean);
}

/** Estrategia 2: navegar para a URL de busca do portal. */
async function tryUrlSearch(tabId, profile, query) {
  if (!profile.buildUrl) return false;

  const target = profile.buildUrl(query);
  if (!target) return false;

  const current = await getTab(tabId);
  if (current && current.url === target) {
    // Ja esta nesta URL (mesma cotacao repetida): recarrega para refazer a busca.
    await chrome.tabs.reload(tabId);
  } else {
    await chrome.tabs.update(tabId, { url: target });
  }

  await waitForLoad(tabId);
  return true;
}

/** Estrategia 3: preencher o campo de busca dentro da pagina. */
async function tryInPageSearch(tabId, profile, query) {
  const outcome = await inject(tabId, PAGE_runSearch, [{
    searchInputSel: profile.searchInputSel,
    searchButtonSel: profile.searchButtonSel,
  }, query]);

  return Boolean(outcome && outcome.ok);
}

/**
 * Aguarda a pagina renderizar resultados, sondando em blocos curtos.
 * Cada sondagem e um evento no service worker, o que tambem o mantem acordado
 * durante a espera (a SPA pode levar dezenas de segundos para renderizar).
 */
async function waitForResults(tabId, profile, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;

  while (Date.now() < deadline) {
    let probe = null;
    try {
      probe = await inject(tabId, PAGE_probe, [{ containerSel: profile.containerSel }]);
    } catch (error) {
      throw error;
    }

    if (probe) {
      lastProbe = probe;

      if (probe.ready) return probe;
      if (probe.empty) return probe;
      if (probe.logging) return { ...probe, needsLogin: true };
    }

    // Detecta redirecionamento para a tela de login do portal.
    const tab = await getTab(tabId);
    if (tab && /login|signin|entrar|account\/login/i.test(String(tab.url || ''))) {
      return { ...(lastProbe || {}), needsLogin: true, url: tab.url };
    }

    await sleep(800);
  }

  return { ...(lastProbe || {}), ready: false, timedOut: true };
}

/* ------------------------------------------------------------------ *
 * Entrada principal
 * ------------------------------------------------------------------ */

/**
 * Executa a busca de um fornecedor no Chrome do lojista.
 * Sempre devolve um array no contrato do backend; a lista vazia significa
 * "nenhuma oferta" e o backend trata isso como tal.
 */
export async function dispatchSupplierSearch(supplier, query, taskId = null) {
  const profile = resolveProfile(supplier);
  const label = profile.name;

  console.log(`[AutoPecas] Busca: ${label} -> "${query}"`);

  const tab = await ensureTab(profile, taskId);
  if (!tab || tab.id == null) {
    throw new Error(`Nao foi possivel abrir a aba do fornecedor ${label}.`);
  }

  const tabId = tab.id;

  try {
    await waitForLoad(tabId);

    // Se a aba abriu direto numa tela de login, executa login automatico imediatamente
    const currentTab = await getTab(tabId);
    const tabUrl = String(currentTab?.url || '').toLowerCase();
    const hasLoginCredentials = Boolean(supplier?.loginCredential && supplier?.password);

    if (hasLoginCredentials && (/login|signin|entrar|account\/login/i.test(tabUrl) || tabUrl.includes('customer/account/login'))) {
      console.log(`[AutoPecas] ${label}: Pagina de login inicial detectada. Efetuando login automatico silencioso...`);
      const initialLogin = await inject(tabId, PAGE_autoLogin, [{
        loginCredential: supplier.loginCredential,
        password: supplier.password,
        loginUserSelector: supplier.loginUserSelector,
        loginPassSelector: supplier.loginPassSelector,
        loginSubmitSelector: supplier.loginSubmitSelector,
      }]);

      if (initialLogin && initialLogin.attempted) {
        console.log(`[AutoPecas] ${label}: Credenciais submetidas. Aguardando autenticacao...`);
        await sleep(3500);
        await waitForLoad(tabId);
      }
    }

    // 1) endpoint interno aprendido (caminho rapido)
    const learned = await tryLearnedEndpoint(tabId, query);
    if (learned && learned.length > 0) {
      console.log(`[AutoPecas] ${label}: ${learned.length} item(ns) via endpoint interno.`);
      return learned.map((item) => ({ ...item, provider: label }));
    }

    // 2) URL de busca do portal, quando o portal aceita o termo na query string
    const urlSearched = await tryUrlSearch(tabId, profile, query);

    // 3) Campo de busca dentro da pagina (SPA sem URL de busca, ex: DPK)
    const fieldSearched = urlSearched ? false : await tryInPageSearch(tabId, profile, query);

    let probe = await waitForResults(tabId, profile, 20000);

    // Se pediu login apos a tentativa de busca, faz login automatico e repete a busca
    if (probe.needsLogin && hasLoginCredentials) {
      console.log(`[AutoPecas] ${label}: Sessao nao autenticada. Efetuando login automatico silencioso...`);
      const autoLoginRes = await inject(tabId, PAGE_autoLogin, [{
        loginCredential: supplier.loginCredential,
        password: supplier.password,
        loginUserSelector: supplier.loginUserSelector,
        loginPassSelector: supplier.loginPassSelector,
        loginSubmitSelector: supplier.loginSubmitSelector,
      }]);

      if (autoLoginRes && autoLoginRes.attempted) {
        console.log(`[AutoPecas] ${label}: Login submetido. Refazendo busca apos autenticacao...`);
        await sleep(3500);
        await waitForLoad(tabId);

        if (profile.buildUrl) {
          await tryUrlSearch(tabId, profile, query);
        } else {
          await tryInPageSearch(tabId, profile, query);
        }

        probe = await waitForResults(tabId, profile, 15000);
      }
    }

    // Se nao veio nada, tenta a outra abordagem antes de desistir:
    // portal com SPA as vezes so responde ao campo, e vice-versa.
    if (!probe.ready && !probe.empty && !probe.needsLogin) {
      if (urlSearched) {
        await tryInPageSearch(tabId, profile, query);
      } else if (profile.buildUrl) {
        await tryUrlSearch(tabId, profile, query);
      } else if (!fieldSearched) {
        await tryInPageSearch(tabId, profile, query);
      }

      probe = await waitForResults(tabId, profile, 15000);
    }

    if (probe.needsLogin) {
      throw new Error(
        `${label} pediu login. Verifique se o login e a senha cadastrados no painel estao corretos.`
      );
    }

    // Extrai o DOM (mesmo sem resultado, para respeitar o cache do backend).
    const items = await inject(tabId, PAGE_extract, [{
      query: query,
      provider: label,
      containerSel: profile.containerSel,
      nameSel: profile.nameSel,
      priceSel: profile.priceSel,
    }]);

    const list = Array.isArray(items) ? items : [];
    console.log(`[AutoPecas] ${label}: ${list.length} item(ns) encontrados.`);

    if (list.length === 0 && probe.timedOut) {
      throw new Error(
        `${label} nao respondeu a busca a tempo. Verifique se a aba continuou logada e se o portal mudou de layout.`
      );
    }

    return list;
  } finally {
    taskTabs.delete(taskId);
    await releaseTab(profile);
  }
}

/** Fecha a aba do fornecedor quando o perfil nao deve manter a aba aquecida. */
async function releaseTab(profile) {
  if (profile.keepTab) return;

  const tabId = supplierTabs.get(profile.key);
  if (tabId == null) return;

  supplierTabs.delete(profile.key);
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) {
    // aba ja fechada pelo usuario
  }
}

/* ------------------------------------------------------------------ *
 * Utilitarios compartilhados com o restante da extensao
 * ------------------------------------------------------------------ */

/** Converte "R$ 1.234,56" em 1234.56. */
export function parsePriceValue(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const match = String(raw || '').match(/\d[\d.,]*/);
  if (!match) return 0;

  let value = match[0];
  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (value.includes('.')) {
    const parts = value.split('.');
    const last = parts[parts.length - 1];
    value = parts.length > 2 || last.length === 3 ? parts.join('') : value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export { supplierTabs, taskTabs };