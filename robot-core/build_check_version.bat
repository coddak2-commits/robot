@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d "C:\Users\d113964\Desktop\git\robot\robot-core"

set SDK_INC=..\fairino-cpp-sdk-main\windows\libfairino\include
set SDK_LIB=..\fairino-cpp-sdk-main\windows\libfairino\lib\vs2022 x86-64\Release

cl.exe /nologo /EHsc /std:c++17 /utf-8 check_version.cpp /I"%SDK_INC%" /link "%SDK_LIB%\fairino.lib"

if errorlevel 1 (
    echo [BUILD-FAILED]
    pause
    exit /b 1
)

copy /Y "%SDK_LIB%\fairino.dll" . >nul

echo [BUILD-OK] check_version.exe
echo.
echo Usage: check_version.exe [robot_ip]
echo   default IP: 192.168.58.2
pause
