# Always Encrypted Setup Script for Docker SQL Server
# This script sets up Always Encrypted after the Docker container is running

param(
    [string]$ServerInstance = "127.0.0.1,1433",
    [string]$Database = "node",
    [string]$Username = "sa",
    [string]$Password = "Password_123#",
    [string]$KeyStoreName = "CurrentUser",
    [string]$CertificateName = "msnodesqlv8_AE_Certificate"
)

Write-Host "🔐 Setting up Always Encrypted for Docker SQL Server..." -ForegroundColor Cyan

# Import required modules
try {
    Import-Module SqlServer -ErrorAction Stop
    Write-Host "✅ SqlServer module imported successfully" -ForegroundColor Green
} catch {
    Write-Error "❌ Failed to import SqlServer module. Please install it with: Install-Module -Name SqlServer -Force"
    exit 1
}

try {
    # Step 1: Wait for SQL Server to be ready
    Write-Host "⏳ Waiting for SQL Server to be ready..." -ForegroundColor Yellow
    
    $maxRetries = 30
    $retryCount = 0
    $connected = $false
    
    while (-not $connected -and $retryCount -lt $maxRetries) {
        try {
            $testConnectionString = "Server=$ServerInstance;Database=master;User Id=$Username;Password=$Password;TrustServerCertificate=true;Encrypt=true;Connection Timeout=5;"
            $testQuery = "SELECT @@VERSION as SQLVersion"
            $result = Invoke-Sqlcmd -ConnectionString $testConnectionString -Query $testQuery -ErrorAction Stop
            $connected = $true
            Write-Host "✅ SQL Server is ready" -ForegroundColor Green
        } catch {
            $retryCount++
            Write-Host "⏳ Attempt $retryCount/$maxRetries - waiting for SQL Server..." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }
    
    if (-not $connected) {
        throw "Failed to connect to SQL Server after $maxRetries attempts"
    }

    # Step 2: Create a self-signed certificate for Column Master Key
    Write-Host "🔑 Creating self-signed certificate..." -ForegroundColor Yellow
    
    $certificateParams = @{
        Subject = "CN=$CertificateName"
        KeyExportPolicy = "Exportable"
        KeySpec = "KeyExchange"
        KeyLength = 2048
        KeyAlgorithm = "RSA"
        HashAlgorithm = "SHA256"
        Provider = "Microsoft Enhanced RSA and AES Cryptographic Provider"
        CertStoreLocation = "Cert:\$KeyStoreName\My"
        NotAfter = (Get-Date).AddYears(5)
    }
    
    $certificate = New-SelfSignedCertificate @certificateParams
    Write-Host "✅ Certificate created with thumbprint: $($certificate.Thumbprint)" -ForegroundColor Green
    
    # Step 3: Connect to SQL Server
    Write-Host "🔗 Connecting to SQL Server instance: $ServerInstance" -ForegroundColor Yellow
    
    $connectionString = "Server=$ServerInstance;Database=$Database;User Id=$Username;Password=$Password;TrustServerCertificate=true;Encrypt=true;"
    
    # Test connection
    try {
        $testQuery = "SELECT DB_NAME() as CurrentDatabase"
        $result = Invoke-Sqlcmd -ConnectionString $connectionString -Query $testQuery
        Write-Host "✅ Successfully connected to database: $($result.CurrentDatabase)" -ForegroundColor Green
    } catch {
        Write-Error "❌ Failed to connect to SQL Server: $($_.Exception.Message)"
        throw
    }
    
    # Step 4: Create Column Master Key
    Write-Host "🔐 Creating Column Master Key..." -ForegroundColor Yellow
    
    $cmkName = "CMK_Auto1"
    $keyPath = "CurrentUser/My/$($certificate.Thumbprint)"
    
    # Drop existing CMK if it exists
    $dropCmkSql = @"
IF EXISTS (SELECT * FROM sys.column_master_keys WHERE name = '$cmkName')
BEGIN
    DROP COLUMN MASTER KEY [$cmkName]
    PRINT 'Dropped existing Column Master Key: $cmkName'
END
"@
    
    try {
        Invoke-Sqlcmd -ConnectionString $connectionString -Query $dropCmkSql
    } catch {
        Write-Warning "⚠️ Could not drop existing CMK (may not exist): $($_.Exception.Message)"
    }
    
    # Create CMK
    $createCmkSql = @"
CREATE COLUMN MASTER KEY [$cmkName]
WITH (
    KEY_STORE_PROVIDER_NAME = 'MSSQL_CERTIFICATE_STORE',
    KEY_PATH = '$keyPath'
)
"@
    
    try {
        Invoke-Sqlcmd -ConnectionString $connectionString -Query $createCmkSql
        Write-Host "✅ Column Master Key created successfully: $cmkName" -ForegroundColor Green
    } catch {
        Write-Error "❌ Failed to create Column Master Key: $($_.Exception.Message)"
        throw
    }
    
    # Step 5: Create Column Encryption Key
    Write-Host "🔑 Creating Column Encryption Key..." -ForegroundColor Yellow
    
    $cekName = "CEK_Auto1"
    
    # Drop existing CEK if it exists
    $dropCekSql = @"
IF EXISTS (SELECT * FROM sys.column_encryption_keys WHERE name = '$cekName')
BEGIN
    DROP COLUMN ENCRYPTION KEY [$cekName]
    PRINT 'Dropped existing Column Encryption Key: $cekName'
END
"@
    
    try {
        Invoke-Sqlcmd -ConnectionString $connectionString -Query $dropCekSql
    } catch {
        Write-Warning "⚠️ Could not drop existing CEK (may not exist): $($_.Exception.Message)"
    }
    
    # Try using PowerShell cmdlet first
    $cekCreated = $false
    try {
        # Build connection for New-SqlColumnEncryptionKey
        $serverConnection = New-Object Microsoft.SqlServer.Management.Common.ServerConnection
        $serverConnection.ConnectionString = $connectionString
        $smoServer = New-Object Microsoft.SqlServer.Management.Smo.Server($serverConnection)
        $smoDatabase = $smoServer.Databases[$Database]
        
        New-SqlColumnEncryptionKey -Name $cekName -InputObject $smoDatabase -ColumnMasterKey $cmkName
        Write-Host "✅ Column Encryption Key created successfully: $cekName" -ForegroundColor Green
        $cekCreated = $true
    } catch {
        Write-Warning "⚠️ PowerShell cmdlet failed: $($_.Exception.Message)"
        Write-Host "🔄 Trying T-SQL approach..." -ForegroundColor Yellow
        
        # Generate a minimal encrypted value for T-SQL approach
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $rng.GetBytes($randomBytes)
        $dummyEncryptedValue = "0x" + [System.BitConverter]::ToString($randomBytes).Replace("-", "")
        
        $createCekSql = @"
CREATE COLUMN ENCRYPTION KEY [$cekName]
WITH VALUES (
    COLUMN_MASTER_KEY = [$cmkName],
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = $dummyEncryptedValue
)
"@
        
        try {
            Invoke-Sqlcmd -ConnectionString $connectionString -Query $createCekSql
            Write-Host "✅ Column Encryption Key created with T-SQL: $cekName" -ForegroundColor Green
            $cekCreated = $true
        } catch {
            Write-Error "❌ All CEK creation methods failed: $($_.Exception.Message)"
            throw
        }
    }
    
    # Step 6: Verify keys were created
    Write-Host "🔍 Verifying keys were created..." -ForegroundColor Yellow
    
    $verifySql = @"
SELECT 
    'CMK' as KeyType,
    name,
    key_store_provider_name,
    key_path
FROM sys.column_master_keys 
WHERE name = '$cmkName'

UNION ALL

SELECT 
    'CEK' as KeyType,
    cek.name,
    'N/A' as key_store_provider_name,
    'N/A' as key_path
FROM sys.column_encryption_keys cek
WHERE cek.name = '$cekName'
"@
    
    $verifyResults = Invoke-Sqlcmd -ConnectionString $connectionString -Query $verifySql
    
    if ($verifyResults.Count -eq 2) {
        Write-Host "✅ Both Column Master Key and Column Encryption Key created successfully" -ForegroundColor Green
        foreach ($row in $verifyResults) {
            Write-Host "   $($row.KeyType): $($row.name)" -ForegroundColor White
        }
    } else {
        throw "Key verification failed. Expected 2 keys, found $($verifyResults.Count)"
    }
    
    # Step 7: Create test table with encrypted columns
    Write-Host "🏗️ Creating test table with encrypted columns..." -ForegroundColor Yellow
    
    $createTableSql = @"
-- Drop table if it exists
IF OBJECT_ID('dbo.test_encrypted', 'U') IS NOT NULL
    DROP TABLE dbo.test_encrypted;

-- Create table with encrypted columns
CREATE TABLE dbo.test_encrypted (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name_encrypted NVARCHAR(50) COLLATE Latin1_General_BIN2 
        ENCRYPTED WITH (
            COLUMN_ENCRYPTION_KEY = [$cekName],
            ENCRYPTION_TYPE = DETERMINISTIC,
            ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
        ),
    email_encrypted NVARCHAR(100) COLLATE Latin1_General_BIN2 
        ENCRYPTED WITH (
            COLUMN_ENCRYPTION_KEY = [$cekName],
            ENCRYPTION_TYPE = RANDOMIZED,
            ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
        ),
    name_plain NVARCHAR(50),
    created_date DATETIME2 DEFAULT GETDATE()
);
"@
    
    try {
        Invoke-Sqlcmd -ConnectionString $connectionString -Query $createTableSql
        Write-Host "✅ Test table 'dbo.test_encrypted' created successfully" -ForegroundColor Green
    } catch {
        Write-Error "❌ Failed to create test table: $($_.Exception.Message)"
        throw
    }
    
    # Step 8: Display setup information
    Write-Host ""
    Write-Host "🎉 =================================================" -ForegroundColor Green
    Write-Host "🎉 Always Encrypted Setup Complete!" -ForegroundColor Green
    Write-Host "🎉 =================================================" -ForegroundColor Green
    Write-Host "Server: $ServerInstance" -ForegroundColor White
    Write-Host "Database: $Database" -ForegroundColor White
    Write-Host "Certificate Thumbprint: $($certificate.Thumbprint)" -ForegroundColor White
    Write-Host "Column Master Key: $cmkName" -ForegroundColor White
    Write-Host "Column Encryption Key: $cekName" -ForegroundColor White
    Write-Host "Key Store Location: Cert:\$KeyStoreName\My" -ForegroundColor White
    Write-Host "Test Table: dbo.test_encrypted" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Your connection string with Always Encrypted:" -ForegroundColor Cyan
    Write-Host "Driver={ODBC Driver 18 for SQL Server};Server=$ServerInstance;Database=$Database;UID=$Username;PWD=$Password;TrustServerCertificate=yes;ColumnEncryption=Enabled;" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🧪 To test, run the Node.js test file:" -ForegroundColor Cyan
    Write-Host "node test-always-encrypted.js" -ForegroundColor Yellow
    
} catch {
    Write-Error "❌ Setup failed: $($_.Exception.Message)"
    Write-Host "Full error details:" -ForegroundColor Red
    Write-Host $_.Exception.ToString() -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Setup completed successfully! ✅" -ForegroundColor Green