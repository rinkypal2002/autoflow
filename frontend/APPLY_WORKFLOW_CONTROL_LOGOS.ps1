$ErrorActionPreference = 'Stop'

$projectRoot = (Get-Location).Path
$sourceDir = Join-Path $env:USERPROFILE 'Downloads\workflow_control_icons_pack'
$targetDir = Join-Path $projectRoot 'public\plugins'

$required = @(
  'workflow_control.png',
  'start.png',
  'end.png',
  'for_each.png',
  'while.png',
  'repeat_until.png',
  'break.png',
  'continue.png'
)

if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
  throw "Workflow Control icon folder not found: $sourceDir"
}
if (-not (Test-Path -LiteralPath $targetDir -PathType Container)) {
  throw "AutoFlow plugin logo folder not found: $targetDir. Run this script from the AutoFlow frontend project root."
}

$missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $sourceDir $_) -PathType Leaf) })
if ($missing.Count -gt 0) {
  throw ('Missing required icon(s): ' + ($missing -join ', '))
}

# Validate the generated pack before copying. Every Workflow Control asset is expected to be 48x48 PNG.
Add-Type -AssemblyName System.Drawing
foreach ($name in $required) {
  $src = Join-Path $sourceDir $name
  $image = [System.Drawing.Image]::FromFile($src)
  try {
    if ($image.Width -ne 48 -or $image.Height -ne 48) {
      throw "$name is $($image.Width)x$($image.Height); expected 48x48. No files were copied."
    }
  }
  finally {
    $image.Dispose()
  }
}

foreach ($name in $required) {
  Copy-Item -LiteralPath (Join-Path $sourceDir $name) -Destination (Join-Path $targetDir $name) -Force
}

Write-Host 'WORKFLOW CONTROL LOGOS COPIED: 8/8'
Write-Host "Source: $sourceDir"
Write-Host "Target: $targetDir"
