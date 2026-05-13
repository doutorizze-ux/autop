param(
    [Parameter(Mandatory = $true)]
    [string]$BackendUrl,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string[]]$Suppliers = @("Comdip", "KKI", "Kaizen", "Real Moto Pecas", "Furacao", "Sky Pecas", "DPK"),
    [string]$SearchWorkers = "1",
    [string]$Headless = "true"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot "local-agent\start-supplier-agents.ps1"

& $scriptPath -BackendUrl $BackendUrl -Token $Token -Suppliers $Suppliers -SearchWorkers $SearchWorkers -Headless $Headless
