/**
 * page-hook.js
 *
 * Roda no MAIN world (o mesmo contexto da pagina), em document_start, antes de
 * qualquer script do portal. Grava as chamadas JSON que a propria SPA faz.
 *
 * PRA QUE SERVE: os portais (DPK e Angular, Kaizen e um painel SPA, etc.) tem
 * endpoints internos de busca que so o proprio site conhece. Em vez de adivinhar
 * essas rotas, aprendemos a rota real observando o trafego do portal e depois
 * repetimos essa chamada direto no contexto da pagina: same-origin, com os
 * cookies do lojista, sem CORS e em ~300ms.
 *
 * O resultado e espelhado em sessionStorage (compartilhado entre o MAIN world e
 * o world isolado da extensao), para o service worker conseguir ler.
 */

(function () {
  if (window.__autopecasHookInstalled) return;
  window.__autopecasHookInstalled = true;

  const MAX_ENTRIES = 40;
  const entries = [];

  const SEARCH_HINT = /search|busca|pesquisa|produto|catalog|consulta|estoque|preco/i;

  function looksLikeSearch(url, body) {
    if (SEARCH_HINT.test(String(url || ''))) return true;
    if (SEARCH_HINT.test(String(body || ''))) return true;
    return false;
  }

  function remember(entry) {
    try {
      if (!entry || !entry.url) return;
      if (!looksLikeSearch(entry.url, entry.body)) return;
      if (!/^https?:/i.test(entry.url)) return;

      entries.push(entry);
      if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
      }

      window.__autopecasNet = entries;
      sessionStorage.setItem('__autopecasNet', JSON.stringify(entries.slice(-12)));
    } catch (_) {
      // sessionStorage cheio ou bloqueado: seguir sem gravar
    }
  }

  // --- Hook de fetch ---
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        let body = (init && init.body) || null;

        if (typeof body === 'string' && body.includes('__QUERY__') === false) {
          // Guarda com marcador para poder trocar so o termo no replay.
          body = body.replace(/("(?:termo|busca|descricao|codigo|cod|q|query|filtro|pesquisa)"\s*:\s*")[^"]*(")/gi, '$1__QUERY__$2');
        }

        remember({ url: url, method: method, body: body, bodyTemplate: null, at: Date.now() });
      } catch (_) {}

      return originalFetch.apply(this, arguments);
    };
  }

  // --- Hook de XMLHttpRequest ---
  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === 'function') {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url) {
      try {
        this.__autopecasMethod = String(method || 'GET').toUpperCase();
        this.__autopecasUrl = String(url || '');
      } catch (_) {}
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function (body) {
      try {
        let captured = body;
        if (typeof captured === 'string') {
          captured = captured.replace(
            /("(?:termo|busca|descricao|codigo|cod|q|query|filtro|pesquisa)"\s*:\s*")[^"]*(")/gi,
            '$1__QUERY__$2'
          );
        }

        const url = this.__autopecasUrl || '';
        const method = this.__autopecasMethod || 'GET';

        this.addEventListener('load', () => {
          try {
            const contentType = String(this.getResponseHeader('content-type') || '');
            if (!/json/i.test(contentType)) return;
            const parsed = JSON.parse(this.responseText || 'null');
            if (!parsed) return;
            remember({
              url: url,
              method: method,
              body: captured,
              responseShape: Array.isArray(parsed) ? 'array' : typeof parsed,
              at: Date.now(),
            });
          } catch (_) {}
        });
      } catch (_) {}

      return originalSend.apply(this, arguments);
    };
  }
})();