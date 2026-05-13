param(
    [string]$OutputRoot = "dist-agent",
    [string]$PackageName = "Autopecas-Agente-Loja",
    [string]$BackendUrl = "https://api.centroautomotivo0058.store",
    [string]$Token = "",
    [string[]]$Suppliers = @("Comdip", "KKI", "Real Moto Pecas", "Furacao", "Sky Pecas", "DPK"),
    [switch]$IncludeToken
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot $OutputRoot
$packageDir = Join-Path $outputDir $PackageName
$zipPath = Join-Path $outputDir "$PackageName.zip"

if (Test-Path $packageDir) {
    Remove-Item -LiteralPath $packageDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

function Copy-TreeClean {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$Destination,

        [string[]]$ExcludeNames = @()
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        if ($ExcludeNames -contains $_.Name) {
            return
        }

        $target = Join-Path $Destination $_.Name
        if ($_.PSIsContainer) {
            Copy-TreeClean -Source $_.FullName -Destination $target -ExcludeNames $ExcludeNames
        } else {
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }
}

Copy-Item -LiteralPath (Join-Path $projectRoot "Iniciar Agentes Autopecas.cmd") -Destination $packageDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "Parar Agentes Autopecas.cmd") -Destination $packageDir -Force

Copy-TreeClean `
    -Source (Join-Path $projectRoot "local-agent") `
    -Destination (Join-Path $packageDir "local-agent") `
    -ExcludeNames @(
        "browser-profiles",
        "cloud-agent.config.json",
        "agent-run.err.log",
        "agent-run.out.log"
    )

Copy-TreeClean `
    -Source (Join-Path $projectRoot "scraping") `
    -Destination (Join-Path $packageDir "scraping") `
    -ExcludeNames @(
        "sessions",
        "tmp-default-chrome",
        "tmp-kaizen-fullclone",
        "tmp-kaizen-profile",
        "tmp-kaizen-userdata",
        "tmp-kaizen-vanilla",
        "debug_error.png"
    )

Get-ChildItem -LiteralPath (Join-Path $packageDir "scraping") -Force | Where-Object {
    $_.Name -like "tmp-*"
} | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
}

$configToken = if ($IncludeToken -and $Token) { $Token } else { "COLOQUE_AQUI_O_LOCAL_AGENT_TOKEN" }
$config = [ordered]@{
    backendUrl = $BackendUrl
    token = $configToken
    suppliers = $Suppliers
    searchWorkers = "1"
    headless = "true"
}

$config | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $packageDir "local-agent\cloud-agent.config.json") -Encoding UTF8

@"
# Autopecas Agente da Loja

## Como instalar

1. Extraia esta pasta em `C:\Autopecas Agente`.
2. Instale o Node.js LTS se ainda nao estiver instalado.
3. Abra `local-agent\cloud-agent.config.json` e confira o token.
4. Clique duas vezes em `Iniciar Agentes Autopecas.cmd`.

## Uso diario

- Para iniciar: clique em `Iniciar Agentes Autopecas.cmd`.
- Para parar: clique em `Parar Agentes Autopecas.cmd`.

## Fornecedores ativos

$($Suppliers -join ", ")

## Observacao

Kaizen nao esta incluido na lista padrao enquanto nao estiver cadastrado no sistema.
"@ | Set-Content -Path (Join-Path $packageDir "LEIA-ME.txt") -Encoding UTF8

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -LiteralPath (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Pacote criado:"
Write-Host $packageDir
Write-Host ""
Write-Host "ZIP criado:"
Write-Host $zipPath
