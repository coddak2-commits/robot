@echo off
cd /d "%~dp0"
taskkill /F /IM robot-back.exe >nul 2>&1
taskkill /F /IM robot_core.exe >nul 2>&1
taskkill /F /IM robot_camera.exe >nul 2>&1
taskkill /F /IM robot_blackfly.exe >nul 2>&1
start "" /min robot-back.exe
if exist robot_camera.exe start "" /min robot_camera.exe
REM Blackfly: use Spinnaker DLLs installed on this PC
if exist "%ProgramFiles%\Teledyne\Spinnaker\bin64\vs2015" set "PATH=%ProgramFiles%\Teledyne\Spinnaker\bin64\vs2015;%PATH%"
if exist robot_blackfly.exe start "" /min robot_blackfly.exe
timeout /t 2 /nobreak >nul
start "" robot_core.exe
