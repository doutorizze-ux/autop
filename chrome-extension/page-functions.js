/**
 * page-functions.js
 *
 * Funcoes que rodam DENTRO da pagina do fornecedor, injetadas por
 * chrome.scripting.executeScript a partir do service worker.
 *
 * POR QUE ASSIM: o service worker do Manifest V3 nao tem DOM (nao existe
 * DOMParser/document/window) e o fetch de dentro dele e barrado por CORS nos
 * portais dos fornecedores. Rodando dentro da aba real do lojista temos:
 *   - DOM de verdade, ja renderizado pela SPA (DPK/KKI/Sky/Kaizen/Furacao);
 *   - cookies e sessao autenticada valendo, em requisicao same-origin;
 *   - o IP e o fingerprint reais do Chrome logado (Cloudflare nao barra).
 *
 * ATENCAO CRITICA: o Chrome serializa cada funcao (func.toString()) e a reinjeta
 * na pagina. Por isso TODA funcao exportada aqui deve ser TOTALMENTE
 * AUTO-CONTIDA: nada de referenciar imports, constantes de modulo ou outras
 * funcoes deste arquivo. Cada helper necessario tem de ser declarado DENTRO da
 * propria funcao, mesmo que fique repetido.
 */

/* ------------------------------------------------------------------ *
 * Sondagem de renderizacao (chamada repetidamente, em chunks curtos)
 * ------------------------------------------------------------------ */

/**
 * Verificacao barata e rapida do estado da pagina.
 * O service worker chama isto a cada ~800ms (cada chamada e um evento novo, o
 * que mantem o worker vivo) e so extrai quando `ready` fica verdadeiro.
 */
export function PAGE_probe(cfg) {
  let containers = 0;
  try {
    containers = document.querySelectorAll(cfg.containerSel || '').length;
  } catch (_) {
    containers = 0;
  }

  let priced = 0;
  if (containers > 0) {
    try {
      const nodes = Array.from(document.querySelectorAll(cfg.containerSel || ''));
      for (const node of nodes) {
        const text = String(node.textContent || '');
        if (/R\$\s*\d|\d+,\d{2}/.test(text)) {
          priced += 1;
        }
      }
    } catch (_) {
      priced = 0;
    }
  }

  // Se os seletores cadastrados nao casarem, procura qualquer no com preco em R$
  // para nao esperar o timeout inteiro num portal cujo HTML mudou.
  let loosePreco = 0;
  if (priced === 0) {
    try {
      const candidates = document.querySelectorAll('span,div,p,b,strong,td,li');
      let scanned = 0;
      for (const el of candidates) {
        if (scanned > 400) break;
        scanned += 1;
        if (el.children.length === 0 && /R\$\s*\d|\d+,\d{2}/.test(String(el.textContent || ''))) {
          loosePreco += 1;
        }
      }
    } catch (_) {
      loosePreco = 0;
    }
  }

  const bodyText = String(document.body ? document.body.innerText : '').slice(0, 4000).toLowerCase();
  const empty = /nenhum produto|nenhum resultado|nao encontrado|n.o encontrado|sem resultados|0 resultados|nada encontrado/.test(bodyText);
  const logging = /fazer login|entrar na conta|senha|credenciais|sess.o expirada/.test(bodyText);

  return {
    url: location.href,
    title: document.title || '',
    containers: containers,
    priced: priced,
    loosePreco: loosePreco,
    ready: priced > 0 || loosePreco > 0,
    empty: empty && priced === 0 && loosePreco === 0,
    logging: logging && priced === 0 && loosePreco === 0,
    dpr: window.devicePixelRatio || 1,
  };
}

/* ------------------------------------------------------------------ *
 * Extracao de produtos do DOM
 * ------------------------------------------------------------------ */

/**
 * Extrai os produtos da pagina ja renderizada e devolve no MESMO formato que o
 * backend espera (price/product/code/brand/stock...). O contrato importa: o
 * backend descarta em silencio todo item cujo `price` nao seja numerico
 * (scraper.service.ts -> normalizeSupplierResults).
 */
export function PAGE_extract(cfg) {
  const query = String(cfg.query || '');
  const provider = String(cfg.provider || '');
  const results = [];
  const seen = new Set();

  // ---- helpers locais (obrigatoriamente dentro da funcao: ver nota no topo) ----
  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const toNum = (raw) => {
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
  };

  const firstOf = (root, selectorList) => {
    if (!root || !selectorList) return null;
    for (const sel of String(selectorList).split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const found = root.querySelector(sel);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  };

  const codeFrom = (cardText) => {
    const labelled = cardText.match(/c[oo]d(?:igo)?(?:\s*(?:fabricante|fab|original|produto))?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9./_-]{3,})/i);
    if (labelled) return labelled[1].trim();
    const generic = cardText.match(/\b([A-Z]{2,}[A-Z0-9][A-Z0-9./_-]{3,})\b/);
    if (generic) return generic[1].trim();
    return '';
  };

  const brandFrom = (cardText) => {
    const match = cardText.match(/\bmarca\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s.&/-]{1,30}?)(?:\s{2,}|$|\s(?:c[oo]d|estoque|qtd|ref))/i);
    return match ? match[1].trim() : '';
  };

  const stockTextFrom = (cardText) => {
    const unit = cardText.match(/\d+\s*(?:un|und|unid|pcs?|pe[cc]as)\b/i);
    if (unit) return unit[0].trim();
    const words = cardText.match(/dispon[ii]vel(?:\s+imediato)?|em estoque|pronta entrega|fora de estoque|sem estoque|indispon[ii]vel|esgotado/i);
    return words ? words[0].trim() : '';
  };

  const push = (item) => {
    if (!item || !(item.price > 0)) return;
    const key = `${item.code || ''}|${String(item.product || '').toLowerCase()}|${item.price}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const buildItem = (card, nameEl, priceEl) => {
    const cardText = norm(card && card.textContent);
    const name = norm(nameEl && nameEl.textContent) || norm(cardText.split(/R\$/)[0]);
    const price = toNum(priceEl && priceEl.textContent);
    if (!name || name.length < 3) return null;

    let link = location.href;
    try {
      const linkEl = card && card.querySelector ? card.querySelector('a[href]') : null;
      const rawLink = linkEl ? linkEl.getAttribute('href') : '';
      link = rawLink ? new URL(rawLink, location.origin).href : location.href;
    } catch (_) {
      link = location.href;
    }

    const stockText = stockTextFrom(cardText);
    const stockMatch = stockText.match(/\d+/);
    const unavailable = /fora de estoque|sem estoque|indispon[ii]vel|esgotado|avise[- ]?me/i.test(cardText);

    return {
      provider: provider,
      product: name,
      price: price,
      available: !unavailable,
      link: link,
      stock: stockMatch ? Number.parseInt(stockMatch[0], 10) : 0,
      stockText: stockText,
      code: codeFrom(cardText),
      brand: brandFrom(cardText),
      application: '',
      variantKey: `${name}|`,
    };
  };

  // ---- 1) caminho preferencial: seletores cadastrados no fornecedor ----
  let containers = [];
  try {
    containers = Array.from(document.querySelectorAll(cfg.containerSel || ''));
  } catch (_) {
    containers = [];
  }

  for (const card of containers) {
    if (results.length >= 40) break;
    if (!card || card.nodeType !== 1) continue;

    const priceEl = firstOf(card, cfg.priceSel) || card.querySelector('span,div,b,strong,td');
    if (!priceEl) continue;

    const nameEl = firstOf(card, cfg.nameSel)
      || card.querySelector('h1,h2,h3,h4,strong,a');

    push(buildItem(card, nameEl, priceEl));
  }

  // ---- 2) fallback: sobe a partir de cada preco em R$ procurando o cartao ----
  if (results.length === 0) {
    let priceNodes = [];
    try {
      priceNodes = Array.from(document.querySelectorAll('span,div,p,b,strong,td,li'))
        .filter((el) => el.children.length === 0 && /R\$\s*\d|\d+,\d{2}/.test(String(el.textContent || '')))
        .slice(0, 80);
    } catch (_) {
      priceNodes = [];
    }

    for (const priceEl of priceNodes) {
      if (results.length >= 40) break;

      let card = priceEl;
      for (let depth = 0; depth < 4 && card && card.parentElement; depth += 1) {
        card = card.parentElement;
        if (/produt|item|card|result|linha|row|sku/i.test(String(card.className || ''))) break;
      }
      if (!card) continue;

      const cardText = norm(card.textContent);
      if (cardText.length < 8 || cardText.length > 900) continue;

      const found = firstOf(card, cfg.nameSel)
        || card.querySelector('h1,h2,h3,h4,.titulo,.nome,.descricao,strong,a');
      const nameEl = found && norm(found.textContent).replace(/R\$.*/, '').trim().length >= 3
        ? found
        : null;

      push(buildItem(card, nameEl, priceEl));
    }
  }

  return results.slice(0, 40);
}

/* ------------------------------------------------------------------ *
 * Busca executada dentro da propria pagina (portais com SPA / sem URL de busca)
 * ------------------------------------------------------------------ */

/**
 * Preenche o campo de busca e dispara a acao do jeito que o site espera.
 * Usa o setter nativo do value para que React/Angular enxerguem a mudanca
 * (atribuir el.value direto nao dispara o onChange desses frameworks).
 */
export function PAGE_runSearch(cfg, query) {
  const setNativeValue = (input, value) => {
    const proto = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const candidates = [];
  if (cfg.searchInputSel) {
    for (const sel of String(cfg.searchInputSel).split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        candidates.push(...document.querySelectorAll(sel));
      } catch (_) {}
    }
  }

  try {
    candidates.push(...document.querySelectorAll(
      'input[type="search"], input[placeholder*="pesquis" i], input[placeholder*="busca" i], ' +
      'input[placeholder*="c[oo]digo" i], input[placeholder*="produto" i], input[name*="busca" i]'
    ));
  } catch (_) {}

  const input = candidates.find((el) => {
    if (!el || el.disabled || el.readOnly) return false;
    const type = String(el.getAttribute('type') || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 20 && rect.height > 8;
  });

  if (!input) {
    return { ok: false, reason: 'input-nao-encontrado' };
  }

  input.focus();
  setNativeValue(input, String(query));

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

  let button = null;
  if (cfg.searchButtonSel) {
    for (const sel of String(cfg.searchButtonSel).split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const found = document.querySelector(sel);
        if (found) { button = found; break; }
      } catch (_) {}
    }
  }
  if (!button) {
    const form = input.form || (input.closest ? input.closest('form') : null);
    button = form ? form.querySelector('button[type="submit"], button[type="button"]') : null;
  }

  if (button && typeof button.click === 'function') {
    button.click();
  } else {
    const form = input.form || (input.closest ? input.closest('form') : null);
    if (form && typeof form.requestSubmit === 'function') {
      try { form.requestSubmit(); } catch (_) {}
    }
  }

  return { ok: true, value: input.value };
}

/* ------------------------------------------------------------------ *
 * Endpoint interno aprendido do proprio site (replay)
 * ------------------------------------------------------------------ */

/** Le as rotas que a SPA chamou, gravadas em sessionStorage pelo page-hook. */
export function PAGE_readLearnedEndpoints() {
  try {
    const raw = sessionStorage.getItem('__autopecasNet');
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Repete a chamada que o proprio portal faz.
 * DEVE rodar no MAIN world: assim a requisicao e identica a do site (mesma
 * origem efetiva, mesmos cookies, mesmas regras de CORS que o portal ja cumpre).
 */
export async function PAGE_replayEndpoint(endpoint, query) {
  const method = String(endpoint && endpoint.method || 'POST').toUpperCase();
  const headers = { 'Accept': 'application/json, text/plain, */*' };
  let url = String((endpoint && endpoint.url) || '');
  let body = null;

  if (!url) return { ok: false, reason: 'sem-url' };

  if (method === 'GET') {
    // Troca o valor do parametro de busca pelo novo termo.
    url = url.replace(/([?&][^=&]+=)([^&]*)/g, (full, prefix, value) => {
      let decoded = value;
      try { decoded = decodeURIComponent(value); } catch (_) {}
      return decoded.length >= 2 ? `${prefix}${encodeURIComponent(query)}` : full;
    });
  } else {
    const template = String((endpoint && (endpoint.bodyTemplate || endpoint.body)) || '');
    if (!template) return { ok: false, reason: 'sem-body' };

    body = template.replace(/__QUERY__/g, String(query).replace(/["\\]/g, '\\$&'));

    if (!template.includes('__QUERY__')) {
      let parsed = null;
      try { parsed = JSON.parse(template); } catch (_) {}
      if (parsed && typeof parsed === 'object') {
        const keys = ['termo', 'busca', 'descricao', 'codigo', 'cod', 'q', 'query', 'filtro', 'pesquisa'];
        const target = keys.find((key) => key in parsed);
        if (!target) return { ok: false, reason: 'sem-campo-de-busca' };
        parsed[target] = String(query);
        body = JSON.stringify(parsed);
      } else {
        return { ok: false, reason: 'body-nao-json' };
      }
    }

    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: method,
    headers: headers,
    credentials: 'include',
    body: method === 'GET' ? undefined : body,
  });

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const textBody = await response.text();
  if (textBody.length > 2_000_000) {
    return { ok: false, reason: 'resposta-muito-grande' };
  }

  let data = null;
  try {
    data = JSON.parse(textBody);
  } catch (_) {
    return { ok: false, reason: 'resposta-nao-json' };
  }

  return { ok: true, data: data };
}

/* ------------------------------------------------------------------ *
 * Login Assistido (controle da aba pelo painel)
 * ------------------------------------------------------------------ */

/** Estado da aba: url, titulo e escala de pixels (para converter o clique). */
export function PAGE_getState() {
  return {
    url: location.href,
    title: document.title || '',
    dpr: window.devicePixelRatio || 1,
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  };
}

/**
 * Clique por coordenada, focado em campos de formulario.
 * O painel manda coordenadas na escala da IMAGEM do screenshot; o service worker
 * divide pelo devicePixelRatio antes de chamar isto. Focar antes de clicar e o
 * que faz o "Digitar" seguinte acertar o campo.
 */
export function PAGE_click(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return { ok: false, reason: 'sem-elemento' };

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }
  }

  const opts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
  };

  try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (_) {}
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));

  return {
    ok: true,
    tag: el.tagName || '',
    focused: document.activeElement ? document.activeElement.tagName || '' : '',
  };
}

/** Digita no campo focado, usando o setter nativo (compativel com React/Angular). */
export function PAGE_type(text) {
  const el = document.activeElement;
  if (!el || el === document.body) {
    return { ok: false, reason: 'nenhum-campo-focado' };
  }

  const editable = typeof el.value === 'string'
    || el.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

  if (!editable) {
    return { ok: false, reason: `elemento-nao-editavel:${el.tagName}` };
  }

  const value = String(text == null ? '' : text);

  if (el.isContentEditable) {
    el.textContent = String(el.textContent || '') + value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, tag: el.tagName };
  }

  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const next = String(el.value || '') + value;

  if (descriptor && descriptor.set) {
    descriptor.set.call(el, next);
  } else {
    el.value = next;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { ok: true, tag: el.tagName, value: el.value };
}

/** Enter / Tab / Escape. Tab sintetico nao move o foco no Chrome, entao movemos. */
export function PAGE_press(key) {
  const el = document.activeElement || document.body;
  const normalized = String(key || 'Enter');

  const init = { key: normalized, code: normalized, bubbles: true, cancelable: true, composed: true };
  if (normalized === 'Enter') { init.keyCode = 13; init.which = 13; }
  if (normalized === 'Escape') { init.keyCode = 27; init.which = 27; }
  if (normalized === 'Tab') { init.keyCode = 9; init.which = 9; }

  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keypress', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));

  if (normalized === 'Enter') {
    const form = el.form || (el.closest ? el.closest('form') : null);
    if (form && typeof form.requestSubmit === 'function') {
      try { form.requestSubmit(); } catch (_) {}
    }
  }

  if (normalized === 'Tab') {
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]), button, a[href], select, textarea, [tabindex]:not([tabindex="-1"])'
      ));
    } catch (_) {
      nodes = [];
    }
    const focusables = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !node.disabled;
    });
    const index = focusables.indexOf(el);
    const next = focusables[index + 1] || focusables[0];
    if (next && typeof next.focus === 'function') next.focus();
  }

  return { ok: true, tag: el.tagName || '' };
}

/** Conteudo de localStorage/sessionStorage da aba (cookies vem do chrome.cookies). */
export function PAGE_readWebStorage() {
  const dump = (storage, label) => {
    const out = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const name = storage.key(i);
        out.push({ name: name, value: String(storage.getItem(name) || '') });
      }
    } catch (_) {}
    return out;
  };

  return {
    origin: location.origin,
    localStorage: dump(window.localStorage),
    sessionStorage: dump(window.sessionStorage),
    url: location.href,
  };
}

/** Preenche login e senha e submete o formulario de login do fornecedor */
export function PAGE_autoLogin(cfg) {
  try {
    const user = String(cfg?.loginCredential || '').trim();
    const pass = String(cfg?.password || '').trim();
    if (!user || !pass) {
      return { attempted: false, reason: 'Credenciais ausentes' };
    }

    function setVal(el, val) {
      if (!el) return false;
      el.focus();
      const proto = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    // 1. Localiza campo de usuario/login
    let uInput = null;
    if (cfg.loginUserSelector) {
      try { uInput = document.querySelector(cfg.loginUserSelector); } catch (_) {}
    }
    if (!uInput) {
      const candidates = Array.from(document.querySelectorAll(
        'input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="email" i], input[id*="user" i], input[id*="login" i], input[placeholder*="email" i], input[placeholder*="cnpj" i], input[placeholder*="cpf" i], input[placeholder*="usuario" i], input[type="text"]'
      ));
      uInput = candidates.find((el) => {
        const type = String(el.type || '').toLowerCase();
        return type !== 'password' && type !== 'hidden' && type !== 'checkbox' && type !== 'submit';
      });
    }

    // 2. Localiza campo de senha
    let pInput = null;
    if (cfg.loginPassSelector) {
      try { pInput = document.querySelector(cfg.loginPassSelector); } catch (_) {}
    }
    if (!pInput) {
      pInput = document.querySelector('input[type="password"]');
    }

    if (!uInput || !pInput) {
      return { attempted: false, reason: 'Campos de usuario/senha nao encontrados' };
    }

    setVal(uInput, user);
    setVal(pInput, pass);

    // 3. Localiza botao de submit
    let btn = null;
    if (cfg.loginSubmitSelector) {
      try { btn = document.querySelector(cfg.loginSubmitSelector); } catch (_) {}
    }
    if (!btn) {
      const btnCandidates = Array.from(document.querySelectorAll(
        'button[type="submit"], input[type="submit"], button.btn-entrar, button.btn-primary, button'
      ));
      btn = btnCandidates.find((b) => {
        const text = String(b.textContent || b.value || '').toLowerCase();
        return text.includes('entrar') || text.includes('acessar') || text.includes('login');
      });
    }

    if (btn) {
      btn.click();
    } else if (pInput.form) {
      pInput.form.submit();
    } else {
      pInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }

    return { attempted: true };
  } catch (err) {
    return { attempted: false, error: err.message };
  }
}