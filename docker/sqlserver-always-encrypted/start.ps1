# Complete Docker SQL Server with Always Encrypted Setup
# This script sets up everything from scratch: Docker container + Always Encrypted

param(
    [switch]$SkipDirectoryCreation = $false,
    [switch]$SkipContainerStart = $false,
    [switch]$SkipAlwaysEncrypted = $false
)

Write-Host "🚀 Starting Complete SQL Server + Always Encrypted Setup" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Step 1: Create local directories for SQL Server data
if (-not $SkipDirectoryCreation) {
    Write-Host "📁 Creating local directories for SQL Server data..." -ForegroundColor Yellow
    
    $sqlServerPath = "$env:USERPROFILE\sqlserver"
    $directories = @("data", "log", "backup")
    
    foreach ($dir in $directories) {
        $fullPath = Join-Path $sqlServerPath $dir
        if (-not (Test-Path $fullPath)) {
            New-Item -Path $fullPath -ItemType Directory -Force | Out-Null
            Write-Host "✅ Created: $fullPath" -ForegroundColor Green
        } else {
            Write-Host "ℹ️ Already exists: $fullPath" -ForegroundColor Blue
        }
    }
} else {
    Write-Host "⏭️ Skipping directory creation" -ForegroundColor Gray
}

# Step 2: Start Docker container
if (-not $SkipContainerStart) {
    Write-Host "🐳 Starting SQL Server Docker container..." -ForegroundColor Yellow
    
    # Stop and remove existing container if it exists
    try {
        $existingContainer = docker ps -a --filter "name=sqlserver-always-encrypted" --format "{{.Names}}"
        if ($existingContainer -eq "sqlserver-always-encrypted") {
            Write-Host "🛑 Stopping existing container..." -ForegroundColor Yellow
            docker stop sqlserver-always-encrypted | Out-Null
            docker rm sqlserver-always-encrypted | Out-Null
            Write-Host "✅ Removed existing container" -ForegroundColor Green
        }
    } catch {
        Write-Host "ℹ️ No existing container to remove" -ForegroundColor Blue
    }
    
    # Start new container
    Write-Host "🚀 Starting new SQL Server container..." -ForegroundColor Yellow
    try {
        docker-compose up -d
        Write-Host "✅ Docker container started successfully" -ForegroundColor Green
    } catch {
        Write-Error "❌ Failed to start Docker container: $($_.Exception.Message)"
        exit 1
    }
    
    # Wait for SQL Server to be ready
    Write-Host "⏳ Waiting for SQL Server to be ready..." -ForegroundColor Yellow
    $maxWait = 120 # 2 minutes
    $waited = 0
    $ready = $false
    
    while (-not $ready -and $waited -lt $maxWait) {
        try {
            $healthCheck = docker exec sqlserver-always-encrypted /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Password_123#" -Q "SELECT 1" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $ready = $true
                Write-Host "✅ SQL Server is ready!" -ForegroundColor Green
            } else {
                Start-Sleep -Seconds 5
                $waited += 5
                Write-Host "⏳ Still waiting... ($waited/$maxWait seconds)" -ForegroundColor Yellow
            }
        } catch {
            Start-Sleep -Seconds 5
            $waited += 5
            Write-Host "⏳ Still waiting... ($waited/$maxWait seconds)" -ForegroundColor Yellow
        }
    }
    
    if (-not $ready) {
        Write-Error "❌ SQL Server failed to start within $maxWait seconds"
        exit 1
    }
} else {
    Write-Host "⏭️ Skipping container start" -ForegroundColor Gray
}

# Step 3: Set up Always Encrypted
if (-not $SkipAlwaysEncrypted) {
    Write-Host "🔐 Setting up Always Encrypted..." -ForegroundColor Yellow
    
    try {
        # Run the Always Encrypted setup script
        & ".\scripts\setup-always-encrypted.ps1"
        Write-Host "✅ Always Encrypted setup completed" -ForegroundColor Green
    } catch {
        Write-Error "❌ Always Encrypted setup failed: $($_.Exception.Message)"
        Write-Host "You can run it manually later with: .\scripts\setup-always-encrypted.ps1" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️ Skipping Always Encrypted setup" -ForegroundColor Gray
}

# Step 4: Display summary and next steps
Write-Host ""
Write-Host "🎉 =========================================" -ForegroundColor Green
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host "🎉 =========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Connection Details:" -ForegroundColor Cyan
Write-Host "   Server: 127.0.0.1,1433" -ForegroundColor White
Write-Host "   Database: node" -ForegroundColor White
Write-Host "   Username: sa" -ForegroundColor White
Write-Host "   Password: Password_123#" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Connection Strings:" -ForegroundColor Cyan
Write-Host "   Basic: Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;" -ForegroundColor Yellow
Write-Host "   Always Encrypted: Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;ColumnEncryption=Enabled;" -ForegroundColor Yellow
Write-Host ""
Write-Host "🧪 Test Commands:" -ForegroundColor Cyan
Write-Host "   Test basic connection: docker exec sqlserver-always-encrypted /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P 'Password_123#' -d node -Q 'SELECT COUNT(*) FROM dbo.test_basic'" -ForegroundColor White
Write-Host "   Test Always Encrypted: node .\scripts\test-always-encrypted.js" -ForegroundColor White
Write-Host ""
Write-Host "🐳 Docker Commands:" -ForegroundColor Cyan
Write-Host "   View logs: docker logs sqlserver-always-encrypted" -ForegroundColor White
Write-Host "   Stop container: docker-compose down" -ForegroundColor White
Write-Host "   Restart container: docker-compose restart" -ForegroundColor White
Write-Host ""
Write-Host "📁 Data Location:" -ForegroundColor Cyan
Write-Host "   Local data directory: $env:USERPROFILE\sqlserver" -ForegroundColor White
Write-Host ""
Write-Host "✨ Your SQL Server with Always Encrypted is ready to use!" -ForegroundColor Green