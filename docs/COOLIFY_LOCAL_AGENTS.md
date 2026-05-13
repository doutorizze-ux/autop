# Deploy Coolify com agentes locais por fornecedor

## Objetivo

O Coolify roda o sistema principal. O PC da loja roda os agentes locais. Assim, as consultas aos fornecedores saem pelo IP da loja, nao pelo IP do servidor.

## Variaveis recomendadas no Coolify

Backend:

```env
DATABASE_URL=file:///app/backend/data/dev.db
JWT_SECRET=troque-por-um-segredo-forte
LOCAL_AGENT_TOKEN=troque-por-outro-segredo-forte
LOCAL_AGENT_REQUIRE_FOR_SEARCH=true
LOCAL_AGENT_FALLBACK_ON_FAILURE=false
SCRAPER_CONCURRENCY=7
SCRAPER_SUPPLIER_TIMEOUT_MS=165000
LOCAL_AGENT_TASK_TIMEOUT_MS=180000
LOCAL_AGENT_HEARTBEAT_TIMEOUT_MS=45000
ANTHROPIC_API_KEY=sua-chave-se-usar-ia
```

Frontend:

```env
VITE_API_URL=
```

Deixe `VITE_API_URL` vazio quando frontend e backend estiverem no mesmo compose/dominio. O nginx do frontend encaminha `/api` e `/socket.io` para o backend.

## Subir agentes no PC da loja

No PowerShell, dentro da pasta do projeto:

```powershell
.\local-agent\start-supplier-agents.ps1 `
  -BackendUrl "https://SEU-DOMINIO" `
  -Token "MESMO_VALOR_DO_LOCAL_AGENT_TOKEN" `
  -Suppliers "Comdip","KKI","Kaizen","Real Moto Pecas","Furacao","Sky Pecas","DPK" `
  -SearchWorkers "1"
```

Logs ficam em:

```text
logs/local-agents
```

## Como funciona

1. O usuario cria uma cotacao no painel hospedado no Coolify.
2. O backend cria uma tarefa por fornecedor.
3. Cada agente local puxa apenas tarefas dos fornecedores configurados nele.
4. Os resultados chegam por Socket.IO conforme cada fornecedor responde.
5. Se `LOCAL_AGENT_REQUIRE_FOR_SEARCH=true`, o backend nao tenta consultar fornecedor pelo IP do servidor quando nao houver agente local online.

## Ajuste de velocidade

Use `SCRAPER_CONCURRENCY` no backend para definir quantos fornecedores entram em paralelo por produto.

Com agentes por fornecedor, um valor igual ou maior que a quantidade de fornecedores ativos costuma fazer sentido. Exemplo: `SCRAPER_CONCURRENCY=7`.

No PC da loja, o script inicia um processo por fornecedor. Dentro de cada processo, deixe `LOCAL_AGENT_SEARCH_WORKERS=1` se quiser maxima estabilidade por perfil de navegador, ou aumente apenas quando tiver certeza de que o fornecedor suporta consultas simultaneas.
