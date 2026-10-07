@echo off
rem Starts PumaBass and opens it in your browser. Close this window to quit.
cd /d "%~dp0"
title PumaBass
where node >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & exit /b 1)
node server\server.js
pause
