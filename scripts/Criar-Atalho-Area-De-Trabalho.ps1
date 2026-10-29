$WshShell = New-Object -comObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\AutoPeças Hub.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\..\Iniciar-AutoPecas-Desktop.cmd"
$Shortcut.WorkingDirectory = "$PSScriptRoot\.."
$Shortcut.Description = "AutoPeças Hub - Sistema de Gestão e Cotações"
$Shortcut.WindowStyle = 7 # Minimized launch
$Shortcut.Save()

Write-Host "Atalho 'AutoPeças Hub' criado com sucesso na sua Área de Trabalho!" -ForegroundColor Green
