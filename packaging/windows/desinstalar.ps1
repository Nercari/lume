#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$InstallRoot = Join-Path $env:LOCALAPPDATA 'Lume'

if (Test-Path $InstallRoot) {
    Remove-Item $InstallRoot -Recurse -Force
}

Write-Host 'Lume removido de %LOCALAPPDATA%\Lume.'
Write-Host 'Remova a extensao manualmente em chrome://extensions se ainda aparecer.'
