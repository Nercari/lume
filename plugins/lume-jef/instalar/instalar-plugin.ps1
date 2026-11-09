# Merge rules match plugins/scripts/merge-marketplace.mjs.
# Creates or updates the personal marketplace. Other plugin entries stay.
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginRoot = Split-Path -Parent $here
$dest = Join-Path $env:USERPROFILE '.codex\plugins\lume-jef'
$srcFull = [System.IO.Path]::GetFullPath($pluginRoot)
$destFull = [System.IO.Path]::GetFullPath($dest)
if ($srcFull -ne $destFull) {
  $destParent = Split-Path -Parent $destFull
  New-Item -ItemType Directory -Force -Path $destParent | Out-Null
  if (Test-Path -LiteralPath $destFull) {
    Remove-Item -LiteralPath $destFull -Recurse -Force
  }
  Copy-Item -LiteralPath $srcFull -Destination $destFull -Recurse
}

$entryPath = Join-Path $here 'marketplace-entry.json'
$entry = Get-Content -LiteralPath $entryPath -Raw -Encoding UTF8 | ConvertFrom-Json
$marketDir = Join-Path $env:USERPROFILE '.agents\plugins'
New-Item -ItemType Directory -Force -Path $marketDir | Out-Null
$marketPath = Join-Path $marketDir 'marketplace.json'

if (-not (Test-Path -LiteralPath $marketPath)) {
  $doc = [pscustomobject]@{
    name = 'lume-local'
    interface = [pscustomobject]@{ displayName = 'Lume' }
    plugins = @($entry)
  }
} else {
  $doc = [System.IO.File]::ReadAllText($marketPath) | ConvertFrom-Json
  $doc | Add-Member -NotePropertyName name -NotePropertyValue 'lume-local' -Force
  if ($null -eq $doc.interface) {
    $doc | Add-Member -NotePropertyName interface -NotePropertyValue ([pscustomobject]@{ displayName = 'Lume' }) -Force
  } else {
    $doc.interface | Add-Member -NotePropertyName displayName -NotePropertyValue 'Lume' -Force
  }
  $plugins = @()
  if ($null -ne $doc.plugins) { $plugins = @($doc.plugins) }
  $next = New-Object System.Collections.ArrayList
  $placed = $false
  foreach ($plugin in $plugins) {
    if ($plugin.name -eq 'lume-jef') {
      if (-not $placed) {
        [void]$next.Add($entry)
        $placed = $true
      }
    } else {
      [void]$next.Add($plugin)
    }
  }
  if (-not $placed) { [void]$next.Add($entry) }
  $doc.plugins = @($next.ToArray())
}

function ConvertTo-Plain($value) {
  if ($null -eq $value) { return $null }
  if ($value -is [string] -or $value -is [bool] -or $value -is [ValueType]) { return $value }
  if ($value -is [System.Collections.IDictionary]) {
    $table = @{}
    foreach ($key in $value.Keys) { $table[$key] = ConvertTo-Plain $value[$key] }
    return $table
  }
  if ($value -is [System.Collections.IEnumerable]) {
    $list = New-Object System.Collections.ArrayList
    foreach ($item in @($value)) { [void]$list.Add((ConvertTo-Plain $item)) }
    return $list
  }
  $table = @{}
  foreach ($prop in $value.PSObject.Properties) {
    $table[$prop.Name] = ConvertTo-Plain $prop.Value
  }
  return $table
}

$plain = ConvertTo-Plain $doc
if ($PSVersionTable.PSVersion.Major -ge 6) {
  $json = $plain | ConvertTo-Json -Depth 30
} else {
  Add-Type -AssemblyName System.Web.Extensions
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $serializer.MaxJsonLength = 67108864
  $json = $serializer.Serialize($plain)
}
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($marketPath, $json.TrimEnd() + "`n", $utf8)
Write-Output 'Reinicie o app ChatGPT e instale Lume JEF em Plugins > Lume'
