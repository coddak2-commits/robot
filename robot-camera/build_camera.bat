@echo off
REM robot_camera Windows build (MSVC + vcpkg + Ninja). Run from PowerShell: .\build_camera.bat
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d "%~dp0"
if not exist build mkdir build
cmake -S . -B build -G Ninja ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake ^
  -DVCPKG_TARGET_TRIPLET=x64-windows
if errorlevel 1 ( echo [CONFIGURE-FAILED] & exit /b 1 )
cmake --build build -j 4
if errorlevel 1 ( echo [BUILD-FAILED] & exit /b 2 )
echo [BUILD-OK]
