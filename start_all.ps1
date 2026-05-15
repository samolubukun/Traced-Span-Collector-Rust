# start_all.ps1 - Starts the Server, Dashboard, and Emitter in separate windows

Write-Host "--- Launching Traced Stack ---" -ForegroundColor Cyan

# 1. Start the Server
Write-Host "Launching Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Traced Server'; cd server; cargo run"

# 2. Start the Dashboard
Write-Host "Launching Dashboard..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Traced Dashboard'; cd dashboard; npm run dev"

# 3. Start the Emitter
Write-Host "Launching Emitter..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Traced Emitter'; cd emitter; cargo run -- --duration 1h --workers 5"

Write-Host "`nAll components launched!" -ForegroundColor Green
Write-Host "Dashboard will be available at http://localhost:5173" -ForegroundColor Gray
Write-Host "API Server is running at http://localhost:8080" -ForegroundColor Gray
