#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$BundleRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallRoot = Join-Path $env:LOCALAPPDATA 'Lume'
$ExtensionId = 'odjfiioakpihgkikmjadmohgckkhkjhi'

Write-Host "Instalando Lume em $InstallRoot ..."

if (-not (Test-Path $InstallRoot)) { New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null }

robocopy $BundleRoot $InstallRoot /MIR /XD lume-install /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy falhou com codigo $LASTEXITCODE" }

Write-Host ''
Write-Host 'Proximo passo no Chrome:'
Write-Host '1. Abra chrome://extensions'
Write-Host '2. Ative "Modo do desenvolvedor"'
Write-Host "3. Carregue sem compactacao: $InstallRoot\extension"
Write-Host "4. Confira se o ID da extensao e $ExtensionId (quando empacotado com a chave fixa)."
Write-Host ''
Write-Host 'ChatGPT: copie chatgpt\PROJETO-LUME.md para um Projeto Lume (veja chatgpt\LEIA-ME.md).'
Write-Host ''
