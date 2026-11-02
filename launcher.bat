@echo off
cd /d "%~dp0"
taskkill /F /IM robot-back.exe >nul 2>&1
taskkill /F /IM robot_core.exe >nul 2>&1
taskkill /F /IM robot_camera.exe >nul 2>&1
start "" /min robot-back.exe
if exist robot_camera.exe start "" /min robot_camera.exe
timeout /t 2 /nobreak >nul
start "" robot_core.exe
