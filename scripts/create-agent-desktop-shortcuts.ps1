$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell

$startShortcutPath = Join-Path $desktop "Iniciar Agentes Autopecas.lnk"
$startShortcut = $shell.CreateShortcut($startShortcutPath)
$startShortcut.TargetPath = Join-Path $projectRoot "Iniciar Agentes Autopecas.cmd"
$startShortcut.WorkingDirectory = $projectRoot
$startShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$startShortcut.WindowStyle = 7
$startShortcut.Save()

$stopShortcutPath = Join-Path $desktop "Parar Agentes Autopecas.lnk"
$stopShortcut = $shell.CreateShortcut($stopShortcutPath)
$stopShortcut.TargetPath = Join-Path $projectRoot "Parar Agentes Autopecas.cmd"
$stopShortcut.WorkingDirectory = $projectRoot
$stopShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,131"
$stopShortcut.WindowStyle = 7
$stopShortcut.Save()

Write-Host "Atalhos criados na Area de Trabalho:"
Write-Host $startShortcutPath
Write-Host $stopShortcutPath
