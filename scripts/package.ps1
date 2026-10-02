#Requires -Version 5.1
<#
.SYNOPSIS
  Bump Chrome extension version in manifest.json and build a publish zip.

.PARAMETER Bump
  SemVer part to increment: patch (default), minor, or major.

.PARAMETER Version
  Explicit version (e.g. 1.2.0). Overrides -Bump.

.PARAMETER NoBump
  Skip version change; only rebuild the zip from the current manifest version.

.EXAMPLE
  .\scripts\package.ps1
  .\scripts\package.ps1 -Bump minor
  .\scripts\package.ps1 -Version 2.0.0
  .\scripts\package.ps1 -NoBump
#>
param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch",

  [string]$Version,

  [switch]$NoBump
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $Root "manifest.json"

if (-not (Test-Path $ManifestPath)) {
  throw "manifest.json not found at $ManifestPath"
}

$manifestRaw = Get-Content -Path $ManifestPath -Raw -Encoding UTF8
$manifest = $manifestRaw | ConvertFrom-Json
$oldVersion = [string]$manifest.version

if (-not $oldVersion) {
  throw "manifest.json has no version field"
}

function Get-NextVersion {
  param([string]$Current, [string]$Part)

  if ($Current -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
    throw "Version '$Current' is not X.Y.Z semver"
  }

  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  $patch = [int]$Matches[3]

  switch ($Part) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++; $patch = 0 }
    "patch" { $patch++ }
  }

  return "$major.$minor.$patch"
}

if ($NoBump) {
  $newVersion = $oldVersion
}
elseif ($Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must look like X.Y.Z, got: $Version"
  }
  $newVersion = $Version
}
else {
  $newVersion = Get-NextVersion -Current $oldVersion -Part $Bump
}

if ($newVersion -ne $oldVersion) {
  # Preserve pretty JSON formatting (2-space indent) without rewriting the whole file via ConvertTo-Json
  $updated = [regex]::Replace(
    $manifestRaw,
    '("version"\s*:\s*")[^"]+(")',
    "`${1}$newVersion`${2}",
    1
  )
  if ($updated -eq $manifestRaw) {
    throw "Failed to update version in manifest.json"
  }
  # UTF-8 without BOM
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($ManifestPath, $updated, $utf8NoBom)
}

$zipName = "BYN2USD-$newVersion.zip"
$zipPath = Join-Path $Root $zipName

$include = @(
  "manifest.json",
  "icons\icon-16.png",
  "icons\icon-48.png",
  "icons\icon-128.png",
  "src\background.js",
  "src\content.js",
  "src\popup.html",
  "src\popup.js"
)

foreach ($rel in $include) {
  $full = Join-Path $Root $rel
  if (-not (Test-Path $full)) {
    throw "Missing required file for package: $rel"
  }
}

if (Test-Path $zipPath) {
  Remove-Item -Path $zipPath -Force
}

# Also remove older BYN2USD-*.zip so only the current publish artifact remains
Get-ChildItem -Path $Root -Filter "BYN2USD-*.zip" -File |
  Where-Object { $_.FullName -ne $zipPath } |
  Remove-Item -Force

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
try {
  $archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($rel in $include) {
      $full = Join-Path $Root $rel
      # Chrome expects forward slashes in zip entry names
      $entryName = $rel -replace '\\', '/'
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $full,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      )
    }
  }
  finally {
    $archive.Dispose()
  }
}
finally {
  $zipStream.Dispose()
}

Write-Output "version: $oldVersion -> $newVersion"
Write-Output "zip: $zipPath"
