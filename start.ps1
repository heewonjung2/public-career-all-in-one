# 공기업 All-in-One 실행 스크립트 (Windows PowerShell)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path "backend\.venv")) {
    python -m venv backend\.venv
}
& backend\.venv\Scripts\pip.exe install -q -r backend\requirements.txt

Push-Location frontend
if (-not (Test-Path "node_modules")) { npm install }
npm run build
Pop-Location

Write-Host "http://127.0.0.1:8000 에서 실행합니다 (Ctrl+C로 종료)"
& backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
