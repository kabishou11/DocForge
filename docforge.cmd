@echo off
REM DocForge CLI - 在任意目录运行此命令
setlocal EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
node "%SCRIPT_DIR%bin\docforge.js" %*
endlocal
