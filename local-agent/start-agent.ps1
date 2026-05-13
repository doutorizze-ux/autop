param(
    [Parameter(Mandatory = $true)]
    [string]$BackendUrl,

    [string]$Token = "dummy",
    [string]$AgentId = "$env:COMPUTERNAME-agent",
    [string]$AgentName = "Agente Local $env:COMPUTERNAME",
    [string]$Suppliers = "",
    [string]$SearchWorkers = "3",
    [string]$Headless = "true"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

$env:LOCAL_AGENT_BACKEND_URL = $BackendUrl.TrimEnd("/")
$env:LOCAL_AGENT_TOKEN = $Token
$env:LOCAL_AGENT_ID = $AgentId
$env:LOCAL_AGENT_NAME = $AgentName
$env:LOCAL_AGENT_SUPPLIERS = $Suppliers
$env:LOCAL_AGENT_SEARCH_WORKERS = $SearchWorkers
$env:HEADLESS = $Headless

Set-Location $PSScriptRoot
node ".\\agent.js"
