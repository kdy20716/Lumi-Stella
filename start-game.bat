@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Starlight Farm - Dev
echo.
echo  ==== 별빛 농장 개발 서버 ====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js 가 설치되어 있지 않습니다.
  echo     https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행하세요.
  start "" https://nodejs.org/ko
  pause
  exit /b 1
)
rem package.json 이 바뀌었거나(새 패키지 추가) 아직 설치 전이면 npm install
set NEED_INSTALL=0
if not exist node_modules set NEED_INSTALL=1
if not exist node_modules\firebase\package.json set NEED_INSTALL=1
if not exist node_modules\.pkg-stamp set NEED_INSTALL=1
if exist node_modules\.pkg-stamp fc /b package.json node_modules\.pkg-stamp >nul 2>nul || set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
  echo [1/3] 패키지 설치 중... 1~2분 걸려요.
  call npm install
  if errorlevel 1 ( echo [!] npm install 실패 & pause & exit /b 1 )
  copy /y package.json node_modules\.pkg-stamp >nul
)
echo [2/3] 멀티플레이 서버 시작 (새 창, http://localhost:2567, Socket.io)
start "Starlight Farm - Multiplayer Server" cmd /k "npm run server"
echo [3/3] 게임 실행: http://localhost:5173  (브라우저가 자동으로 열려요)
call npm run dev
pause
