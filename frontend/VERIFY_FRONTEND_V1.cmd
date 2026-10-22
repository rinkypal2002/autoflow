@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo AutoFlow Frontend V1 Verification
echo ============================================================

echo.
echo [1/4] TypeScript type-check...
call npm run typecheck
if errorlevel 1 goto :failed

echo.
echo [2/4] Automated test suites...
call npm test
if errorlevel 1 goto :failed

echo.
echo [3/4] ESLint...
call npm run lint
if errorlevel 1 goto :failed

echo.
echo [4/4] Production build...
call npm run build
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo FRONTEND VERIFICATION PASSED
ECHO ============================================================
exit /b 0

:failed
echo.
echo ============================================================
echo FRONTEND VERIFICATION FAILED - review the error above.
echo ============================================================
exit /b 1
