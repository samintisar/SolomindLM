@echo off
setlocal EnableExtensions
REM Windows hook launcher: run from project root, preserve stdin, always succeed with {}.

if "%CURSOR_PROJECT_DIR%"=="" (
  if not "%CLAUDE_PROJECT_DIR%"=="" set "CURSOR_PROJECT_DIR=%CLAUDE_PROJECT_DIR%"
)

if "%CURSOR_PROJECT_DIR%"=="" (
  echo {}
  exit /b 0
)

cd /d "%CURSOR_PROJECT_DIR%" || (
  echo {}
  exit /b 0
)

node "%CURSOR_PROJECT_DIR%\.cursor\hooks\typecheck-on-edit.mjs"
echo {}
exit /b 0
