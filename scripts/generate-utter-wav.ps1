$ErrorActionPreference = 'Stop'

if (-not $env:UTTER_API_KEY) {
  throw 'Set UTTER_API_KEY in this PowerShell session before running this script.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$narrationPath = Join-Path $repoRoot 'docs/DEMO_VOICEOVER.txt'
$outputDirectory = Join-Path $repoRoot 'demo'
$outputPath = Join-Path $outputDirectory 'optiflow-voiceover.wav'
$narration = (Get-Content -LiteralPath $narrationPath -Raw).Trim()

if ($narration.Length -gt 1000) {
  throw "Utter accepts at most 1,000 characters per request; this script has $($narration.Length)."
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$body = @{ text = $narration; language = 'en-US'; voice = 'leo'; format = 'wav' } | ConvertTo-Json -Compress
Invoke-WebRequest -Uri 'https://api.utter.cc/v1/speech' -Method Post -Headers @{ Authorization = "Bearer $env:UTTER_API_KEY" } -ContentType 'application/json' -Body $body -OutFile $outputPath

$file = Get-Item -LiteralPath $outputPath
if ($file.Length -lt 44) {
  throw 'Utter returned an empty or invalid WAV file.'
}

Write-Output "Saved $($file.FullName) ($($file.Length) bytes)"
