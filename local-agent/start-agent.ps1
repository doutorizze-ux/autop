param(
    [string]$BackendUrl = "http://localhost:5000",
    [string]$Token = "",
    [string]$AgentId = $env:COMPUTERNAME,
    [string]$AgentName = "Agente Local $env:COMPUTERNAME"
)

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "Informe o token do agente local. Exemplo:" -ForegroundColor Yellow
    Write-Host '.\start-agent.ps1 -BackendUrl "https://SEU-SISTEMA" -Token "SEU_TOKEN"' -ForegroundColor Yellow
    exit 1
}

$env:LOCAL_AGENT_BACKEND_URL = $BackendUrl
$env:LOCAL_AGENT_TOKEN = $Token
$env:LOCAL_AGENT_ID = $AgentId
$env:LOCAL_AGENT_NAME = $AgentName
$env:HEADLESS = "false"

Write-Host "Iniciando agente local..." -ForegroundColor Cyan
Write-Host "Backend: $BackendUrl"
Write-Host "Agente: $AgentName ($AgentId)"

node "$PSScriptRoot\agent.js"
