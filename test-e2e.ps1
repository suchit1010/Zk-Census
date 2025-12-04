# Test script for end-to-end flow

Write-Host "`n🧪 ZK-Census End-to-End Test`n" -ForegroundColor Cyan

# Step 1: Check if services are running
Write-Host "1️⃣ Checking services..." -ForegroundColor Yellow

$apiHealth = try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -ErrorAction Stop
    $response.StatusCode -eq 200
} catch {
    $false
}

if (-not $apiHealth) {
    Write-Host "❌ API server not running! Start it with: cd api; node server.js" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ API server running" -ForegroundColor Green

# Step 2: Check indexer data
Write-Host "`n2️⃣ Checking indexer data..." -ForegroundColor Yellow

if (Test-Path "indexer/data/citizens.json") {
    $citizens = Get-Content "indexer/data/citizens.json" | ConvertFrom-Json
    Write-Host "   ✅ Found $($citizens.Count) citizens in indexer" -ForegroundColor Green
    
    if ($citizens.Count -eq 0) {
        Write-Host "   ⚠️  No citizens registered yet" -ForegroundColor Yellow
        Write-Host "   📝 Register via frontend: http://localhost:3000" -ForegroundColor Gray
    }
} else {
    Write-Host "   ⚠️  No citizens file found (indexer may not have run yet)" -ForegroundColor Yellow
}

# Step 3: Check merkle tree
Write-Host "`n3️⃣ Checking merkle tree..." -ForegroundColor Yellow

if (Test-Path "indexer/data/tree.json") {
    $tree = Get-Content "indexer/data/tree.json" | ConvertFrom-Json
    Write-Host "   ✅ Tree has $($tree.leaves.Count) leaves" -ForegroundColor Green
    
    # Get root from API
    $rootData = Invoke-RestMethod -Uri "http://localhost:3001/api/merkle-root"
    Write-Host "   📊 Current root: $($rootData.root.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "   📊 Leaf count: $($rootData.leafCount)" -ForegroundColor Gray
} else {
    Write-Host "   ⚠️  No tree file found" -ForegroundColor Yellow
}

# Step 4: Test merkle proof generation
Write-Host "`n4️⃣ Testing merkle proof API..." -ForegroundColor Yellow

if ($citizens -and $citizens.Count -gt 0) {
    $testCommitment = $citizens[0].commitment
    Write-Host "   🔍 Fetching proof for commitment: $($testCommitment.Substring(0, 20))..." -ForegroundColor Gray
    
    try {
        $proof = Invoke-RestMethod -Uri "http://localhost:3001/api/merkle-proof-by-commitment/$testCommitment"
        Write-Host "   ✅ Proof generated successfully!" -ForegroundColor Green
        Write-Host "      - Leaf index: $($proof.leafIndex)" -ForegroundColor Gray
        Write-Host "      - Path elements: $($proof.pathElements.Count)" -ForegroundColor Gray
        Write-Host "      - Root: $($proof.root.Substring(0, 20))..." -ForegroundColor Gray
    } catch {
        Write-Host "   ❌ Failed to generate proof: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   ⚠️  Skipping (no citizens to test)" -ForegroundColor Yellow
}

# Step 5: Instructions for manual testing
Write-Host "`n5️⃣ Manual Testing Steps:" -ForegroundColor Yellow
Write-Host "   1. Open http://localhost:3000" -ForegroundColor Gray
Write-Host "   2. Connect your Solana wallet" -ForegroundColor Gray
Write-Host "   3. Click 'Register' to create identity" -ForegroundColor Gray
Write-Host "   4. Wait for transaction confirmation" -ForegroundColor Gray
Write-Host "   5. Click 'Prove I'm Alive' to submit proof" -ForegroundColor Gray
Write-Host "   6. Check population increment" -ForegroundColor Gray
Write-Host "   7. Visit http://localhost:3000/admin for dashboard" -ForegroundColor Gray

Write-Host "`n✅ Test complete!`n" -ForegroundColor Cyan
