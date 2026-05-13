# 🛠️ Correção do Sistema de Scraping (Playwright)

Este documento detalha as melhorias implementadas para garantir que o sistema de cotação de autopeças funcione de forma estável, retorne JSON válido e seja compatível com o ambiente **Coolify/Linux**.

## 1. Mudanças Implementadas

### engine.js (O Coração do Robô)
*   **Ambiente Headless**: Configurado para rodar `headless: true` por padrão (ideal para o servidor), mas permite `HEADLESS=false` para debug local.
*   **Args de Performance**: Adicionados flags como `--no-sandbox` e `--disable-dev-shm-usage` essenciais para rodar dentro de containers Docker no Coolify.
*   **Waits Inteligentes**: Substituídos delays fixos por `page.waitForLoadState('networkidle')` e `page.waitForSelector({ state: 'visible' })`.
*   **Extração Híbrida**: Se os seletores específicos do banco estiverem vazios, o robô agora usa heurísticas para tentar encontrar itens de produto e preços (buscando por "R$").

### run-search.js
*   **Saída Padronizada**: O script agora limpa o stdout e imprime **apenas o JSON final**, facilitando a leitura pelo backend.
*   **Tratamento de Erros**: Qualquer falha catastrófica é capturada e retornada como um JSON com a chave `error`, garantindo que o backend nunca fique "no escuro".

### ScraperService (Backend)
*   **Regex de Captura**: Ajustado para capturar o JSON diretamente do stdout, mesmo que haja logs residuais de debug.
*   **Robustez**: Se o robô falhar, o backend agora reporta o erro específico retornado pelo script.

---

## 2. Como Identificar Seletores no Navegador (Guia Prático)

Para que o robô funcione perfeitamente, você precisa preencher os seletores no banco de dados. Siga estes passos no Chrome:

1.  **Abra o site do fornecedor** e faça login manualmente.
2.  **Abra o DevTools** (`F12` ou `Ctrl+Shift+I`).
3.  **Identificar o Container do Item**:
    *   Use a ferramenta de inspeção (setinha no canto superior esquerdo do DevTools).
    *   Passe o mouse sobre um produto na lista de resultados.
    *   Procure a `div` ou `tr` que engloba **todo** o produto (foto, nome e preço).
    *   *Dica:* Geralmente tem classes como `.product-card`, `.item`, `.list-item`.
4.  **Identificar Nome e Preço**:
    *   Dentro desse container, identifique o seletor exato do nome (`.product-title`) e do preço (`.price-value`).
5.  **Testar no Console**:
    *   No console do DevTools, digite: `document.querySelectorAll('.seu-seletor-de-item').length`.
    *   Se retornar o número de produtos na tela, o seletor está correto.

---

## 3. Exemplo de Configuração de Fornecedor (JSON)

Para garantir o sucesso, seus fornecedores no banco de dados devem seguir este padrão:

```json
{
  "name": "Exemplo Peças",
  "url": "https://site.com",
  "needsLogin": true,
  "loginUrl": "https://site.com/login",
  "loginUserSelector": "input[name='usuario']",
  "loginPassSelector": "input[name='senha']",
  "loginSubmitSelector": "button#btn-entrar",
  "searchBarSelector": "input#busca-geral",
  "itemContainerSelector": ".grid-produto",
  "productNameSelector": ".nome-peca",
  "priceSelector": ".preco-final"
}
```

---

## 4. Comandos Úteis para Debug

Se precisar rodar manualmente no servidor para testar:

```bash
# Rodar um teste rápido (estando na pasta scraping)
node run-search.js '{"name":"Teste","url":"https://google.com"}' "Pastilha Hilux"
```

Para ver o navegador abrindo (em ambiente local):
```bash
$env:HEADLESS="false"; node run-search.js ... (Windows PowerShell)
HEADLESS=false node run-search.js ... (Linux/Mac)
```

> [!IMPORTANT]
> Certifique-se de que o servidor Coolify tenha as dependências do Playwright instaladas. No Dockerfile do seu serviço de scraping, deve haver o comando `npx playwright install --with-deps chromium`.
 
---

## 5. Operacao sem cache de preco e com concorrencia

O scraping mantem uma fila exclusiva por fornecedor para impedir que dois workers usem simultaneamente o mesmo perfil persistente do Chrome. Cache de resultado fica desligado por padrao, porque cotacao precisa consultar preco atualizado mesmo quando o mesmo codigo e pesquisado em sequencia.

Variaveis recomendadas:

```bash
SCRAPER_RESULT_CACHE_ENABLED=false
SCRAPER_CACHE_TTL_MS=0
SCRAPER_ENGINE_CACHE_TTL_MS=0
SCRAPER_CACHE_MAX_ENTRIES=500
SCRAPER_PAGE_TIMEOUT_MS=90000
SCRAPER_SUPPLIER_TIMEOUT_MS=165000
SCRAPER_CONCURRENCY=3
```

Para aumentar velocidade, prefira subir `SCRAPER_CONCURRENCY` aos poucos e observar tempo medio/erro por fornecedor. Fornecedores diferentes rodam em paralelo; o mesmo fornecedor fica serializado para preservar estabilidade de sessao.
