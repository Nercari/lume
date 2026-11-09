#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$BundleRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallRoot = Join-Path $env:LOCALAPPDATA 'Lume'
$HostBat = Join-Path $InstallRoot 'windows\lume-host.bat'
$ManifestPath = Join-Path $InstallRoot 'native-messaging\com.lume.chatgpt.json'
$ExtensionId = 'odjfiioakpihgkikmjadmohgckkhkjhi'

Write-Host "Instalando Lume em $InstallRoot ..."

if (-not (Test-Path $InstallRoot)) { New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null }

robocopy $BundleRoot $InstallRoot /MIR /XD lume-install /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou com codigo $LASTEXITCODE" }

$nodeBundled = Join-Path $InstallRoot 'runtime\node\node.exe'
$nodeOk = $false
if (Test-Path $nodeBundled) { $nodeOk = $true }
else {
    $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCmd) { $nodeOk = $true }
}

if ($nodeOk) {
    $nmDir = Split-Path $ManifestPath -Parent
    if (-not (Test-Path $nmDir)) { New-Item -ItemType Directory -Path $nmDir -Force | Out-Null }

    $jsonPath = $HostBat -replace '\\', '\\'
    $manifest = @"
{
  "name": "com.lume.chatgpt",
  "description": "Lume companion: Native Messaging host for the Lume extension",
  "path": "$jsonPath",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ExtensionId/"]
}
"@
    Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

    $regChrome = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lume.chatgpt'
    $regEdge = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.lume.chatgpt'
    New-Item -Path $regChrome -Force | Out-Null
    Set-ItemProperty -Path $regChrome -Name '(default)' -Value $ManifestPath
    New-Item -Path $regEdge -Force | Out-Null
    Set-ItemProperty -Path $regEdge -Name '(default)' -Value $ManifestPath
}
else {
    Write-Host ''
    Write-Host 'Node.js nao foi encontrado (nem em runtime\node, nem no PATH).'
    Write-Host 'O companion (login opcional com ChatGPT) NAO sera registrado nesta instalacao.'
    Write-Host 'A extensao Lume funciona sem o companion: use o painel no PJe normalmente.'
    Write-Host 'Para o login opcional depois, instale o Node 22+ ou inclua runtime\node no pacote e rode instalar.bat novamente.'
    Write-Host ''
}

Write-Host ''
Write-Host 'Proximo passo no Chrome:'
Write-Host '1. Abra chrome://extensions'
Write-Host '2. Ative "Modo do desenvolvedor"'
Write-Host "3. Carregue sem compactacao: $InstallRoot\extension"
Write-Host "4. Confira se o ID da extensao e $ExtensionId (quando empacotado com a chave fixa)."
Write-Host ''
