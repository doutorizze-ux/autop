# Arquitetura do Sistema de Cotacao

## Estado atual mapeado

O projeto esta dividido em quatro blocos principais:

- `backend`: API Express/TypeScript, Prisma com SQLite, rotas de cotacao, fornecedores, login assistido, WhatsApp e catalogo.
- `frontend`: React/Vite, telas operacionais para fornecedores, cotacoes, clientes, WhatsApp e configuracoes.
- `scraping`: engine Playwright CommonJS e estrategias por fornecedor.
- `local-agent`: agente Windows que consulta o backend, executa scraping no ambiente da loja e reutiliza perfis persistentes por fornecedor.

O fluxo de cotacao atual e:

1. Frontend cria um job em `POST /api/quotes/search`.
2. Backend cria um job em memoria e chama `ScraperService.searchMultipleProducts`.
3. Para cada produto, fornecedores sao consultados em lotes paralelos.
4. Se houver agente local ativo, a tarefa vai para `LocalAgentService`; caso contrario, roda no servidor.
5. O agente local puxa tarefas, chama `scraping/engine.js` e devolve o resultado.
6. O backend normaliza resultados, emite progresso via Socket.IO e salva a cotacao no banco.

## Fornecedores identificados

- Comdip: automacao Playwright com URL de busca direta.
- KKI / Auto Norte: automacao Playwright com seletores especificos.
- Kaizen: usa token da sessao no browser e chama API interna `services.kaizenautopecas.com.br/searchcode`.
- Real Moto Pecas / RMP: automacao Magento com URL de busca.
- Furacao / SAV: automacao do portal SAV.
- Sky Pecas: automacao com filiais/unidades.
- DPK: inicializa tokens do Chrome local quando disponiveis e usa URL de busca.

## Gargalos e riscos encontrados

- Perfis persistentes Chromium ficam em `local-agent/browser-profiles` e podem travar se duas buscas do mesmo fornecedor usam o mesmo perfil ao mesmo tempo.
- O backend ja paraleliza fornecedores, mas cada fornecedor ainda abre um contexto/pagina novo por busca.
- Alguns timeouts eram fixos em 120s no Playwright e 180s no agente, aumentando a sensacao de travamento.
- Jobs de cotacao e fila do agente sao em memoria; reinicio do backend perde jobs pendentes.
- Logs, screenshots e perfis temporarios estavam visiveis ao Git, dificultando manutencao.
- Algumas estrategias dependem de seletores visuais frageis; Kaizen e DPK ja tem caminhos mais eficientes via API/token.

## Melhorias aplicadas nesta etapa

- Cache de cotacao por fornecedor/produto no backend com TTL configuravel.
- Timeout por fornecedor no backend para impedir que um portal trave a cotacao inteira.
- Cache no engine de scraping para evitar repeticao imediata da mesma busca.
- Fila exclusiva por fornecedor no engine para evitar colisao de perfil persistente.
- Timeouts Playwright configuraveis via ambiente.
- Tarefas reclamadas por agentes offline podem voltar para pendente.
- `.gitignore` atualizado para logs, backups e artefatos temporarios de browser.

## Variaveis novas ou relevantes

- `SCRAPER_CONCURRENCY`: quantidade de fornecedores em paralelo por produto. Padrao: `3`.
- `SCRAPER_SUPPLIER_TIMEOUT_MS`: timeout de cada fornecedor no backend. Padrao: `165000`.
- `SCRAPER_CACHE_TTL_MS`: TTL do cache de resultados no backend e no engine. Padrao: `600000`.
- `SCRAPER_ENGINE_CACHE_TTL_MS`: TTL especifico do cache do engine, se quiser separar do backend.
- `SCRAPER_CACHE_MAX_ENTRIES`: limite de entradas em cache por processo. Padrao: `500`.
- `SCRAPER_PAGE_TIMEOUT_MS`: timeout padrao do Playwright por pagina. Padrao: `90000`.
- `LOCAL_AGENT_SEARCH_WORKERS`: quantidade de workers de busca no agente local. Padrao: `3`.
- `LOCAL_AGENT_SUPPLIERS`: lista separada por virgula com fornecedores que aquele agente atende. Quando vazia, o agente atende todos.
- `LOCAL_AGENT_FALLBACK_ON_FAILURE`: quando `true`, o backend tenta scraping no servidor se o agente local falhar. Padrao recomendado: desativado para evitar duplicar navegadores.
- `LOCAL_AGENT_REQUIRE_FOR_SEARCH`: quando `true`, o backend nao executa scraping no servidor se nao houver agente local compativel com o fornecedor. Recomendado para Coolify quando o IP do servidor esta bloqueado.
- `LOCAL_AGENT_READ_DASHBOARD_TOKEN`: quando `true`, o agente tenta ler token do Chrome local. Padrao recomendado: `false`, porque `LOCAL_AGENT_TOKEN` ja autentica as rotas do agente.
- `LOCAL_AGENT_TASK_TIMEOUT_MS`: timeout de tarefa no backend aguardando agente. Padrao: `180000`.
- `LOCAL_AGENT_SESSION_TASK_TIMEOUT_MS`: timeout de tarefas de login assistido. Padrao: `120000`.
- `LOCAL_AGENT_HEARTBEAT_TIMEOUT_MS`: janela para considerar agente online. Padrao: `45000`.

## Plano seguro de evolucao

1. Persistir a fila de jobs e tarefas em banco ou Redis para sobreviver a reinicios.
2. Separar workers por fornecedor com limites proprios de concorrencia, timeout e circuito de falha.
3. Criar metricas por fornecedor: tempo medio, taxa de erro, cache hit, motivo de falha e necessidade de relogin.
4. Priorizar API direta para fornecedores com XHR/fetch identificavel, mantendo Playwright como fallback.
5. Migrar de SQLite para PostgreSQL quando houver mais de uma maquina ou concorrencia alta.
6. Criar testes de contrato para normalizacao de resultados e parsing por fornecedor.
7. Adicionar rotina controlada de limpeza de perfis temporarios antigos, sem apagar sessoes persistentes validas.

## Regras de compatibilidade

- Estrategias de fornecedores existentes devem continuar sendo a fonte de verdade.
- APIs internas descobertas nao devem substituir o fluxo visual sem fallback.
- Mudancas em login assistido precisam preservar `sessionData` e perfis persistentes.
- Aumento de concorrencia deve respeitar isolamento por fornecedor para nao corromper perfil Chromium.
