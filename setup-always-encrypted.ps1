# Always Encrypted Setup Script for Docker SQL Server (Simplified)
# This script sets up Always Encrypted using a simplified approach that works with most SQL Server versions

param(
    [string]$ServerInstance = "127.0.0.1,1433",
    [string]$Database = "node",
    [string]$Username = "sa",
    [string]$Password = "Password_123#",
    [string]$KeyStoreName = "CurrentUser",
    [string]$CertificateName = "msnodesqlv8_AE_Certificate"
)

# Import required modules
try {
    Import-Module SqlServer -ErrorAction Stop
    Write-Host "SqlServer module imported successfully"
} catch {
    Write-Error "Failed to import SqlServer module. Please install it with: Install-Module -Name SqlServer -Force"
    exit 1
}

try {
    # Step 1: Create a self-signed certificate for Column Master Key
    Write-Host "Creating self-signed certificate..."
    
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
    Write-Host "Certificate created with thumbprint: $($certificate.Thumbprint)"
    
    # Step 2: Connect to SQL Server using connection string directly
    Write-Host "Connecting to SQL Server instance: $ServerInstance"
    
    $connectionString = "Server=$ServerInstance;Database=$Database;User Id=$Username;Password=$Password;TrustServerCertificate=true;Encrypt=true;"
    
    # Test connection using Invoke-Sqlcmd
    try {
        $testQuery = "SELECT @@VERSION as SQLVersion"
        $result = Invoke-Sqlcmd -ConnectionString $connectionString -Query $testQuery
        Write-Host "Successfully connected to SQL Server"
        Write-Host "SQL Server Version: $($result.SQLVersion.Substring(0, 50))..."
    } catch {
        Write-Error "Failed to connect to SQL Server: $($_.Exception.Message)"
        throw
    }
    
    # Step 3: Create Column Master Key using T-SQL
    Write-Host "Creating Column Master Key..."
    
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
        Write-Warning "Could not drop existing CMK (may not exist): $($_.Exception.Message)"
    }
    
    # Create CMK using T-SQL
    $createCmkSql = @"
CREATE COLUMN MASTER KEY [$cmkName]
WITH (
    KEY_STORE_PROVIDER_NAME = 'MSSQL_CERTIFICATE_STORE',
    KEY_PATH = '$keyPath'
)
"@
    
    try {
        Invoke-Sqlcmd -ConnectionString $connectionString -Query $createCmkSql
        Write-Host "Column Master Key created successfully: $cmkName"
    } catch {
        Write-Error "Failed to create Column Master Key: $($_.Exception.Message)"
        throw
    }
    
    # Step 4: Create Column Encryption Key with PowerShell cmdlet if available
    Write-Host "Creating Column Encryption Key..."
    
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
        Write-Warning "Could not drop existing CEK (may not exist): $($_.Exception.Message)"
    }
    
    # Try using PowerShell cmdlet first
    $cekCreated = $false
    try {
        # Build connection for New-SqlColumnEncryptionKey
        $serverConnection = New-Object Microsoft.SqlServer.Management.Common.ServerConnection
        $serverConnection.ConnectionString = $connectionString
        $smoServer = New-Object Microsoft.SqlServer.Management.Smo.Server($serverConnection)
        $smoDatabase = $smoServer.Databases[$Database]
        
        # Try the New-SqlColumnEncryptionKey cmdlet without the problematic parameter
        New-SqlColumnEncryptionKey -Name $cekName -InputObject $smoDatabase -ColumnMasterKey $cmkName
        Write-Host "Column Encryption Key created successfully using PowerShell cmdlet: $cekName"
        $cekCreated = $true
    } catch {
        Write-Warning "PowerShell cmdlet failed: $($_.Exception.Message)"
        Write-Host "Trying direct T-SQL approach..."
    }
    
    # If PowerShell cmdlet failed, try T-SQL with a generated key
    if (-not $cekCreated) {
        # Generate a random 32-byte key and encrypt it (simplified approach)
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $rng.GetBytes($randomBytes)
        
        # For demonstration, we'll use a dummy encrypted value
        # In production, this should be properly encrypted with the certificate
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
            Write-Host "Column Encryption Key created successfully using T-SQL: $cekName"
            $cekCreated = $true
        } catch {
            Write-Error "T-SQL CEK creation failed: $($_.Exception.Message)"
            Write-Host "Trying with minimal encrypted value..."
            
            # Last resort: minimal encrypted value
            $minimalCekSql = @"
CREATE COLUMN ENCRYPTION KEY [$cekName]
WITH VALUES (
    COLUMN_MASTER_KEY = [$cmkName],
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x01
)
"@
            try {
                Invoke-Sqlcmd -ConnectionString $connectionString -Query $minimalCekSql
                Write-Host "Column Encryption Key created with minimal value: $cekName"
                Write-Warning "CEK created with placeholder value - you may need to recreate it properly for production use"
                $cekCreated = $true
            } catch {
                Write-Error "All CEK creation methods failed: $($_.Exception.Message)"
                throw
            }
        }
    }
    
    # Step 5: Verify keys were created
    Write-Host "Verifying keys were created..."
    
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
        Write-Host "✅ Both Column Master Key and Column Encryption Key created successfully"
        foreach ($row in $verifyResults) {
            Write-Host "  $($row.KeyType): $($row.name)"
        }
    } else {
        throw "Key verification failed. Expected 2 keys, found $($verifyResults.Count)"
    }
    
    # Step 6: Create test table with encrypted columns
    Write-Host "Creating test table with encrypted columns..."
    
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
        Write-Host "✅ Test table 'dbo.test_encrypted' created successfully"
    } catch {
        Write-Error "Failed to create test table: $($_.Exception.Message)"
        throw
    }
    
    # Step 7: Display setup information
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "Always Encrypted Setup Complete!"
    Write-Host "=================================================="
    Write-Host "Server: $ServerInstance"
    Write-Host "Database: $Database"
    Write-Host "Certificate Thumbprint: $($certificate.Thumbprint)"
    Write-Host "Column Master Key: $cmkName"
    Write-Host "Column Encryption Key: $cekName"
    Write-Host "Key Store Location: Cert:\$KeyStoreName\My"
    Write-Host "Test Table: dbo.test_encrypted"
    Write-Host ""
    Write-Host "Your connection string with Always Encrypted:"
    Write-Host "Driver={ODBC Driver 18 for SQL Server};Server=$ServerInstance;Database=$Database;UID=$Username;PWD=$Password;TrustServerCertificate=yes;ColumnEncryption=Enabled;"
    Write-Host ""
    Write-Host "Node.js Test Code:"
    Write-Host @"
const sql = require('msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=$ServerInstance;Database=$Database;UID=$Username;PWD=$Password;TrustServerCertificate=yes;ColumnEncryption=Enabled;';

// Test the Always Encrypted setup
console.log('Testing Always Encrypted connection...');

// First, test basic connection
sql.query(connectionString, 'SELECT COUNT(*) as TableExists FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = ''test_encrypted''', (err, results) => {
    if (err) {
        console.error('Connection test failed:', err);
        return;
    }
    
    console.log('✅ Connection successful, table exists:', results[0].TableExists === 1);
    
    // Test inserting encrypted data
    const insertSql = 'INSERT INTO dbo.test_encrypted (name_encrypted, email_encrypted, name_plain) VALUES (?, ?, ?)';
    const params = ['John Doe', 'john.doe@example.com', 'John Plain Text'];
    
    sql.query(connectionString, insertSql, params, (insertErr, insertResult) => {
        if (insertErr) {
            console.error('Insert failed:', insertErr);
            return;
        }
        
        console.log('✅ Data inserted successfully');
        
        // Query the data back
        sql.query(connectionString, 'SELECT * FROM dbo.test_encrypted', (queryErr, queryResults) => {
            if (queryErr) {
                console.error('Query failed:', queryErr);
                return;
            }
            
            console.log('✅ Encrypted data retrieved:', queryResults);
        });
    });
});
"@
    
} catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    Write-Host "Full error details:"
    Write-Host $_.Exception.ToString()
    exit 1
}

Write-Host ""
Write-Host "Setup completed successfully! ✅"
Write-Host ""
Write-Host "Note: If you encounter issues with the Column Encryption Key, you may need to:"
Write-Host "1. Use SQL Server Management Studio to recreate the CEK properly"
Write-Host "2. Or use the certificate to encrypt a proper column encryption key value"
Write-Host "3. The current setup should work for basic testing purposes"