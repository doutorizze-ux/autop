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

$agentDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $agentDir
$logsDir = Join-Path $projectRoot "logs\local-agents"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Convert-ToAgentSlug {
    param([string]$Value)

    $normalized = $Value.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object Text.StringBuilder

    foreach ($char in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -eq [Globalization.UnicodeCategory]::NonSpacingMark) {
            continue
        }

        if ([char]::IsLetterOrDigit($char)) {
            [void]$builder.Append($char)
        } else {
            [void]$builder.Append("-")
        }
    }

    return (($builder.ToString() -replace "-+", "-").Trim("-"))
}

foreach ($supplier in $Suppliers) {
    $cleanSupplier = $supplier.Trim()
    if (-not $cleanSupplier) {
        continue
    }

    $slug = Convert-ToAgentSlug $cleanSupplier
    $agentId = "$env:COMPUTERNAME-$slug-agent"
    $agentName = "Agente $cleanSupplier"
    $outLogPath = Join-Path $logsDir "$slug.out.log"
    $errLogPath = Join-Path $logsDir "$slug.err.log"

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$agentDir\start-agent.ps1`"",
        "-BackendUrl", "`"$BackendUrl`"",
        "-Token", "`"$Token`"",
        "-AgentId", "`"$agentId`"",
        "-AgentName", "`"$agentName`"",
        "-Suppliers", "`"$cleanSupplier`"",
        "-SearchWorkers", "`"$SearchWorkers`"",
        "-Headless", "`"$Headless`""
    )

    Start-Process powershell.exe `
        -ArgumentList $arguments `
        -WorkingDirectory $agentDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLogPath `
        -RedirectStandardError $errLogPath

    Write-Host "Agente iniciado para $cleanSupplier -> $outLogPath"
}
