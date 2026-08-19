@echo off
REM robot_core Unity build (MSVC + vcpkg + Ninja)
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d "C:\Users\d113964\Desktop\git\robot\robot-core"
if not exist build-unity mkdir build-unity
cmake -S . -B build-unity -G Ninja ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake ^
  -DVCPKG_TARGET_TRIPLET=x64-windows
if errorlevel 1 ( echo [CONFIGURE-FAILED] & pause & exit /b 1 )
cmake --build build-unity -j 4
if errorlevel 1 ( echo [BUILD-FAILED] & pause & exit /b 2 )
echo [BUILD-OK]
pause
