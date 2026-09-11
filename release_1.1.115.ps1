$root = "C:\Users\D113964\Desktop\git\robot"
$newVersion = "1.1.115"
$targets = @(
    @{ Path = "$root\robot-core\src\robot_core_all.cpp"; Pattern = '(#define APP_VERSION_STRING ")1\.1\.\d+(")' },
    @{ Path = "$root\robot-front\src\lib\index.ts"; Pattern = "(export const APP_VERSION = ')1\.1\.\d+(';)" },
    @{ Path = "$root\installer.iss"; Pattern = '(#define MyAppVersion ")1\.1\.\d+(")' }
)
$enc = [System.Text.Encoding]::GetEncoding("ISO-8859-1")
$failed = $false
foreach ($t in $targets) {
    $content = [System.IO.File]::ReadAllText($t.Path, $enc)
    $updated = [System.Text.RegularExpressions.Regex]::Replace($content, $t.Pattern, "`${1}$newVersion`${2}")
    if ($updated -eq $content) { Write-Host "WARNING: no match in $($t.Path)" -ForegroundColor Yellow; $failed = $true }
    else { [System.IO.File]::WriteAllText($t.Path, $updated, $enc); Write-Host "Updated: $($t.Path)" }
}
if ($failed) { Write-Host "Version bump failed, aborting release" -ForegroundColor Red; exit 1 }
$notesPath = Join-Path $root "release_notes_1.1.115.txt"
$notes = Get-Content -Path $notesPath -Raw -Encoding UTF8
cd $root
.\release.ps1 -Version $newVersion -Notes $notes
