$ErrorActionPreference = "Stop"

$agentDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $agentDir
$configPath = Join-Path $agentDir "cloud-agent.config.json"
$exampleConfigPath = Join-Path $agentDir "cloud-agent.config.example.json"
$starterPath = Join-Path $agentDir "start-supplier-agents.ps1"

if (-not (Test-Path $configPath)) {
    Copy-Item -Path $exampleConfigPath -Destination $configPath -Force
    Start-Process notepad.exe -ArgumentList "`"$configPath`""
    Write-Host ""
    Write-Host "Configuracao criada em:"
    Write-Host $configPath
    Write-Host ""
    Write-Host "Preencha o token e salve o arquivo. Depois clique novamente em 'Iniciar Agentes Autopecas'."
    Read-Host "Pressione Enter para fechar"
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$backendUrl = [string]$config.backendUrl
$token = [string]$config.token
$suppliers = @($config.suppliers | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
$searchWorkers = [string]$config.searchWorkers
$headless = [string]$config.headless
if (-not $searchWorkers) { $searchWorkers = "1" }
if (-not $headless) { $headless = "true" }

if (-not $backendUrl -or -not $backendUrl.StartsWith("http")) {
    throw "backendUrl invalido em $configPath"
}

if (-not $token -or $token -eq "COLOQUE_AQUI_O_LOCAL_AGENT_TOKEN") {
    Start-Process notepad.exe -ArgumentList "`"$configPath`""
    throw "Preencha o token em $configPath"
}

if ($suppliers.Count -eq 0) {
    throw "Nenhum fornecedor configurado em $configPath"
}

& (Join-Path $agentDir "stop-cloud-agents.ps1") -Quiet

& $starterPath `
    -BackendUrl $backendUrl `
    -Token $token `
    -Suppliers $suppliers `
    -SearchWorkers $searchWorkers `
    -Headless $headless

$logsDir = Join-Path $projectRoot "logs\local-agents"
Write-Host ""
Write-Host "Agentes Autopecas iniciados."
Write-Host "Fornecedores: $($suppliers -join ', ')"
Write-Host "Logs: $logsDir"
Write-Host ""
Write-Host "Pode fechar esta janela."
Start-Sleep -Seconds 5
