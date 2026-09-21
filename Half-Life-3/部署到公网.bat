@echo off
chcp 65001 >nul
title 半条命 3：重返黑山  ·  部署到公网
cd /d "%~dp0"

:menu
cls
echo.
echo   ============================================================
echo      半条命 3：重返黑山  -  部署到公网
echo   ============================================================
echo.
echo     [1]  临时公网分享（立即生效，无需注册账号）
echo          本机跑服务器 + 建一条临时公网隧道，
echo          命令行会给出一个 https://xxx.trycloudflare.com 地址，
echo          发给别人即可游玩。关掉窗口就失效。
echo.
echo     [2]  部署到 GitHub Pages（免费、永久地址）
echo          自动完成 git 初始化与提交，然后引导你推送到 GitHub。
echo.
echo     [3]  本地启动游戏（只在本机/局域网玩）
echo.
echo     [0]  退出
echo.
set /p choice=  请选择:

if "%choice%"=="1" goto tunnel
if "%choice%"=="2" goto github
if "%choice%"=="3" goto local
if "%choice%"=="0" exit /b 0
goto menu

:local
cls
call "启动游戏.bat"
goto menu

:tunnel
cls
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 需要 Node.js 才能建立隧道。
  echo   请先安装 Node.js: https://nodejs.org/
  echo.
  pause
  goto menu
)
node tunnel.js
echo.
pause
goto menu

:github
cls
echo.
where git >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 git。
  echo   请先安装 Git for Windows: https://git-scm.com/download/win
  echo.
  pause
  goto menu
)
echo   ============================================================
echo      部署到 GitHub Pages
echo   ============================================================
echo.
echo   接下来会做两件事：
echo     1) 在本目录初始化 git 仓库并提交全部文件
echo     2) 打印推送到 GitHub 的具体命令（需要你自己的 GitHub 账号）
echo.
pause
echo.
if not exist ".git" (
  echo   [1/2] git init ...
  git init -q
  git branch -M main 2>nul
) else (
  echo   [1/2] 已存在 git 仓库，跳过初始化
)
echo   [2/2] 提交文件 ...
git add -A
git -c user.name="HL3" -c user.email="hl3@local" commit -q -m "半条命 3：重返黑山 - 浏览器 3D 续作" 2>nul
echo.
echo   完成。接下来在浏览器里操作：
echo.
echo   ------------------------------------------------------------
echo   A. 打开 https://github.com/new
echo   B. 仓库名填： half-life-3      可见性选： Public
echo      ^(不要勾选 Add README / .gitignore，保持空仓库^)
echo   C. 创建后回到这里，把下面两行命令粘进黑窗口回车执行：
echo.
echo      git remote add origin https://github.com/你的用户名/half-life-3.git
echo      git push -u origin main
echo.
echo   D. 推送完成后，进入仓库 Settings - Pages
echo      Source 选 "Deploy from a branch"，Branch 选 main / (root)，保存
echo   E. 等 1~2 分钟，访问：
echo      https://你的用户名.github.io/half-life-3/
echo   ------------------------------------------------------------
echo.
echo   首次 push 会弹出登录窗口（浏览器授权或填 Token），按提示操作即可。
echo.
pause
goto menu
