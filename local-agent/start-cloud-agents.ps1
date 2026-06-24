$ErrorActionPreference = "Stop"

$agentDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $agentDir
$configPath = Join-Path $agentDir "cloud-agent.config.json"
$exampleConfigPath = Join-Path $agentDir "cloud-agent.config.example.json"
$starterPath = Join-Path $agentDir "start-agent.ps1"

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

try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} catch {
    Start-Process notepad.exe -ArgumentList "`"$configPath`""
    throw "O arquivo $configPath nao e um JSON valido. Corrija a virgula, aspas ou colchetes e tente novamente."
}

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

$logsDir = Join-Path $projectRoot "logs\local-agents"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$agentId = "$env:COMPUTERNAME-loja-agent"
$agentName = "Agente Loja $env:COMPUTERNAME"
$supplierFilter = $suppliers -join ","
$outLogPath = Join-Path $logsDir "loja.out.log"
$errLogPath = Join-Path $logsDir "loja.err.log"

$command = @"
& "$starterPath" -BackendUrl "$backendUrl" -Token "$token" -AgentId "$agentId" -AgentName "$agentName" -Suppliers "$supplierFilter" -SearchWorkers "$searchWorkers" -Headless "$headless" 1> "$outLogPath" 2> "$errLogPath"
"@
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = "powershell.exe"
$processInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
$processInfo.WorkingDirectory = $agentDir
$processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$processInfo.UseShellExecute = $true
[System.Diagnostics.Process]::Start($processInfo) | Out-Null

Write-Host ""
Write-Host "Agente Autopecas iniciado."
Write-Host "Fornecedores: $($suppliers -join ', ')"
Write-Host "Logs: $logsDir"
Write-Host "Processo: $agentName"
Write-Host ""
Write-Host "Pode fechar esta janela."
Start-Sleep -Seconds 5
