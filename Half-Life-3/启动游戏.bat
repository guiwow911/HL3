@echo off
chcp 65001 >nul
title 半条命 3：重返黑山  启动器
cd /d "%~dp0"

echo.
echo   ==========================================
echo      半条命 3：重返黑山  -  启动中
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto filemode

echo   [1/2] 正在启动本地服务器 http://127.0.0.1:8123 ...
start "HL3-Server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul

echo   [2/2] 正在打开浏览器 ...
start "" "http://127.0.0.1:8123/"

echo.
echo   游戏已在浏览器中打开。
echo   - 进入页面后点击「开始游戏」，浏览器会请求锁定鼠标（这是第一人称视角必需的）。
echo   - 想停止服务器，请关闭那个最小化的 "HL3-Server" 窗口。
echo.
echo   【手机 / 平板游玩】
echo   - 确保手机和这台电脑连的是同一个 Wi-Fi。
echo   - 在服务器那个最小化窗口里会列出形如 http://192.168.x.x:8123/ 的地址，
echo     用手机浏览器打开它即可（手机端会自动切换成触屏操作）。
echo.
pause
exit /b 0

:filemode
echo   未检测到 Node.js，改用文件方式直接打开（功能完全一致）。
echo.
start "" "index.html"
exit /b 0

