# ZK-Census Development Startup Script

Write-Host "`n🚀 Starting ZK-Census Development Environment`n" -ForegroundColor Cyan

# Check if indexer data directory exists
if (-not (Test-Path "indexer/data")) {
    Write-Host "📁 Creating indexer data directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "indexer/data" -Force | Out-Null
}

# Start Indexer
Write-Host "🌲 Starting Merkle Tree Indexer..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd indexer; node index.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start API Server
Write-Host "🔌 Starting API Server..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd api; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# Start Frontend
Write-Host "💻 Starting Frontend..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd app; npm run dev" -WindowStyle Normal

Write-Host "`n✅ All services starting..." -ForegroundColor Cyan
Write-Host "   - Indexer: Processing events" -ForegroundColor Gray
Write-Host "   - API: http://localhost:3001" -ForegroundColor Gray
Write-Host "   - Frontend: http://localhost:3000" -ForegroundColor Gray
Write-Host "   - Admin: http://localhost:3000/admin" -ForegroundColor Gray
Write-Host "`n📝 Note: Each service runs in its own window" -ForegroundColor Yellow
Write-Host "   Close windows to stop services`n" -ForegroundColor Yellow
