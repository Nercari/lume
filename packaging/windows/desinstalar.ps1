#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$InstallRoot = Join-Path $env:LOCALAPPDATA 'Lume'
$regChrome = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lume.chatgpt'
$regEdge = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.lume.chatgpt'

if (Test-Path $regChrome) { Remove-Item $regChrome -Recurse -Force }
if (Test-Path $regEdge) { Remove-Item $regEdge -Recurse -Force }

if (Test-Path $InstallRoot) {
    Remove-Item $InstallRoot -Recurse -Force
}

Write-Host 'Lume removido de %LOCALAPPDATA%\Lume e os registros Native Messaging (HKCU) foram apagados.'
Write-Host 'Remova a extensao manualmente em chrome://extensions se ainda aparecer.'
