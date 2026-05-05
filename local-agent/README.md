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

## O que ele faz

- envia heartbeat para o backend;
- puxa tarefas de pesquisa pendentes;
- executa o scraping localmente com Playwright;
- devolve os resultados ao sistema principal.
