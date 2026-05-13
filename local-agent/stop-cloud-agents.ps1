param(
    [switch]$Quiet
)

$ErrorActionPreference = "SilentlyContinue"

$agentDir = $PSScriptRoot
$escapedAgentPath = [regex]::Escape((Join-Path $agentDir "agent.js"))

Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match "node|powershell" -and (
        $_.CommandLine -match $escapedAgentPath -or
        $_.CommandLine -match "start-agent.ps1" -or
        $_.CommandLine -match "start-supplier-agents.ps1"
    )
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
}

if (-not $Quiet) {
    Write-Host "Agentes Autopecas parados."
    Start-Sleep -Seconds 3
}
