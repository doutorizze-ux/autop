# Agente Local

Este agente roda no Windows da loja e executa as pesquisas de fornecedores fora do IP do servidor.

## Como usar

1. Defina no backend uma variavel `LOCAL_AGENT_TOKEN` com um valor secreto.
2. Faça deploy do backend.
3. No computador da loja, abra PowerShell na pasta do projeto.
4. Rode:

```powershell
.\local-agent\start-agent.ps1 -BackendUrl "https://SEU-SISTEMA" -Token "SEU_TOKEN"
```

## Agente por fornecedor

Para deixar as buscas mais rapidas e evitar que o servidor do Coolify acesse diretamente os fornecedores, rode agentes filtrados por fornecedor no PC da loja:

```powershell
.\local-agent\start-supplier-agents.ps1 `
  -BackendUrl "https://SEU-SISTEMA" `
  -Token "SEU_TOKEN" `
  -Suppliers "Comdip","KKI","Kaizen","Real Moto Pecas","Furacao","Sky Pecas","DPK"
```

Cada processo anuncia ao backend quais fornecedores atende. Quando uma cotacao dispara varias buscas ao mesmo tempo, o backend entrega a tarefa apenas para o agente daquele fornecedor.

## Modo loja: iniciar com duplo clique

No PC da loja, use o arquivo:

```text
Iniciar Agentes Autopecas.cmd
```

Ele le a configuracao em:

```text
local-agent/cloud-agent.config.json
```

Se o arquivo nao existir, o sistema cria a configuracao a partir do exemplo e abre o Bloco de Notas para preencher.

Para criar atalhos na Area de Trabalho:

```powershell
.\scripts\create-agent-desktop-shortcuts.ps1
```

Isso cria:

- `Iniciar Agentes Autopecas`
- `Parar Agentes Autopecas`

O Kaizen nao fica na lista padrao enquanto nao estiver cadastrado no sistema. Para ativar depois, adicione `"Kaizen"` no array `suppliers` do arquivo `local-agent/cloud-agent.config.json`.

Se quiser iniciar somente um fornecedor:

```powershell
.\local-agent\start-agent.ps1 `
  -BackendUrl "https://SEU-SISTEMA" `
  -Token "SEU_TOKEN" `
  -AgentId "$env:COMPUTERNAME-comdip-agent" `
  -AgentName "Agente Comdip" `
  -Suppliers "Comdip"
```

## O que ele faz

- envia heartbeat para o backend;
- puxa tarefas de pesquisa pendentes;
- executa o scraping localmente com Playwright;
- devolve os resultados ao sistema principal.

## Ajustes de performance e estabilidade

Variaveis uteis para operacao:

```powershell
$env:LOCAL_AGENT_SEARCH_WORKERS="3"
$env:LOCAL_AGENT_SUPPLIERS="Comdip,DPK"
$env:SCRAPER_PAGE_TIMEOUT_MS="90000"
$env:SCRAPER_CACHE_TTL_MS="600000"
$env:LOCAL_AGENT_FALLBACK_ON_FAILURE="false"
$env:LOCAL_AGENT_REQUIRE_FOR_SEARCH="true"
$env:LOCAL_AGENT_READ_DASHBOARD_TOKEN="false"
```

O engine serializa buscas do mesmo fornecedor para proteger perfis persistentes do Chromium, mas continua permitindo fornecedores diferentes em paralelo.
O agente tambem evita ler o token do Chrome a cada ciclo; o `LOCAL_AGENT_TOKEN` ja autentica heartbeat e tarefas.
