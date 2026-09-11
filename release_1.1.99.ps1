$root = "C:\Users\D113964\Desktop\git\robot"
$newVersion = "1.1.99"

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
    if ($updated -eq $content) {
        Write-Host "WARNING: no match in $($t.Path)" -ForegroundColor Yellow
        $failed = $true
    } else {
        [System.IO.File]::WriteAllText($t.Path, $updated, $enc)
        Write-Host "Updated: $($t.Path)"
    }
}

if ($failed) {
    Write-Host "One or more version strings not updated. Aborting release." -ForegroundColor Red
    exit 1
}

cd $root
.\release.ps1 -Version $newVersion -Notes "SDK 래퍼 함수 12개 추가 (툴/워크 좌표계 조회/설정, 부하 파라미터 조회/설정, 세이프티 정지 상태, DO 상태 읽기)"
