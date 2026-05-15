# run_full_test.ps1 - Orchestrates a full test and saves results to JSON

$ResultFile = "test_results.json"
Write-Host "--- Traced System Test & Benchmark ---" -ForegroundColor Cyan

# 1. Ensure everything is clean
Write-Host "Cleaning up old processes..."
Get-Process -Name "server", "emitter" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# 2. Start the Server
Write-Host "Starting Rust Server..." -ForegroundColor Yellow
$ServerJob = Start-Job -ScriptBlock {
    cd "$using:PSScriptRoot\server"
    $env:RUST_LOG = "info"
    cargo run
}

# Wait for server to be ready
$Ready = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $Health = Invoke-RestMethod -Uri "http://localhost:8080/health" -ErrorAction SilentlyContinue
        if ($Health.status -eq "ok") {
            $Ready = $true
            break
        }
    } catch {}
    Write-Host "Waiting for server... ($i/15)"
    Start-Sleep -Seconds 2
}

if (-not $Ready) {
    Write-Host "Error: Server failed to start." -ForegroundColor Red
    Stop-Job $ServerJob
    exit 1
}

Write-Host "Server is ready!" -ForegroundColor Green

# 3. Run the Emitter with JSON output
Write-Host "Running Emitter (30s load test)..." -ForegroundColor Yellow
cd "$PSScriptRoot\emitter"
cargo run -- --duration 30s --workers 20 --json-output "$PSScriptRoot\$ResultFile"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Test Completed Successfully!" -ForegroundColor Green
} else {
    Write-Host "Test Finished with Errors (check JSON for details)." -ForegroundColor Yellow
}

# 4. Final Cleanup
Write-Host "Stopping Server..."
Stop-Job $ServerJob
Get-Process -Name "server" -ErrorAction SilentlyContinue | Stop-Process -Force

# 5. Show Results
if (Test-Path "$PSScriptRoot\$ResultFile") {
    $Results = Get-Content "$PSScriptRoot\$ResultFile" | ConvertFrom-Json
    Write-Host "`n--- Final Results ---" -ForegroundColor Cyan
    Write-Host "Expected Traces: $($Results.expected_traces)"
    Write-Host "Found on Server: $($Results.found_on_server)"
    Write-Host "Missing:         $($Results.missing_traces)" -ForegroundColor (if ($Results.missing_traces -gt 0) { "Red" } else { "Green" })
    Write-Host "Mismatches:      $($Results.span_mismatches)" -ForegroundColor (if ($Results.span_mismatches -gt 0) { "Red" } else { "Green" })
    Write-Host "JSON saved to:   $PSScriptRoot\$ResultFile"
}

Write-Host "`nTo view the dashboard, run 'cd dashboard; npm run dev' and open http://localhost:5173" -ForegroundColor Gray
