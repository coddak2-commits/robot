<#
FR3-WMS Robot Welding Control - build + hash + GitHub Release automation script

Usage (run from repo root):
  .\release.ps1 -Version 1.1.77 -Notes "summary of changes"

Steps:
  1. Build robot-core (build_unity.bat)
  2. Build robot-front (npm run build)
  3. Package installer with installer.iss (iscc)
  4. Generate SHA256 hash of the installer + write .sha256 file
  5. Create GitHub Release with gh release create (attaches exe + sha256)

Stops immediately if any step fails.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Notes = "Release $Version"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

try {
    Step "[1/5] Building robot-core"
    Set-Location (Join-Path $repoRoot "robot-core")
    & .\build_unity.bat
    if ($LASTEXITCODE -ne 0) { throw "robot-core build failed (exit $LASTEXITCODE)" }

    Step "[2/5] Building robot-front"
    Set-Location (Join-Path $repoRoot "robot-front")
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "robot-front build failed (exit $LASTEXITCODE)" }

    Step "[3/5] Packaging installer (iscc)"
    Set-Location $repoRoot
    & iscc installer.iss
    if ($LASTEXITCODE -ne 0) { throw "iscc packaging failed (exit $LASTEXITCODE)" }

    $exeName = "RobotWeldingControl_Setup_$Version.exe"
    $exePath = Join-Path $repoRoot "dist\$exeName"
    if (-not (Test-Path $exePath)) {
        throw "Installer not found: $exePath (check that Version matches installer.iss / APP_VERSION)"
    }

    Step "[4/5] Generating SHA256 hash"
    $hash = (Get-FileHash -Algorithm SHA256 $exePath).Hash
    $shaName = "$exeName.sha256"
    $shaPath = Join-Path $repoRoot "dist\$shaName"
    "$hash  $exeName" | Out-File -Encoding ascii -NoNewline:$false $shaPath
    Write-Host "Hash: $hash"

    Step "[5/5] Creating GitHub Release"
    Set-Location (Join-Path $repoRoot "dist")
    gh release create "v$Version" $exeName $shaName --title "v$Version" --notes $Notes
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed (exit $LASTEXITCODE) - tag may already exist, or gh is not logged in" }

    Write-Host ""
    Write-Host "=== Done: v$Version release created ===" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "!!! FAILED: $_" -ForegroundColor Red
    exit 1
}
finally {
    Set-Location $repoRoot
}
