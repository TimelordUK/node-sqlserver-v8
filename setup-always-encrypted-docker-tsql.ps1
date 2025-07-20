# Always Encrypted Setup Script for Docker SQL Server (T-SQL Version)
# This script sets up Always Encrypted using direct T-SQL commands for better compatibility

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
    
    # Step 2: Connect to SQL Server using SMO with SQL Server authentication
    Write-Host "Connecting to SQL Server instance: $ServerInstance with SQL Server authentication"
    
    # Load SMO assemblies
    Add-Type -AssemblyName "Microsoft.SqlServer.Smo"
    Add-Type -AssemblyName "Microsoft.SqlServer.SqlEnum"
    
    # Create SMO server object with SQL Server authentication
    $smoServer = New-Object Microsoft.SqlServer.Management.Smo.Server($ServerInstance)
    $smoServer.ConnectionContext.LoginSecure = $false
    $smoServer.ConnectionContext.Login = $Username
    $smoServer.ConnectionContext.Password = $Password
    $smoServer.ConnectionContext.TrustServerCertificate = $true
    
    # Test connection
    try {
        $smoServer.ConnectionContext.Connect()
        Write-Host "Successfully connected to SQL Server"
    } catch {
        Write-Error "Failed to connect to SQL Server: $($_.Exception.Message)"
        throw
    }
    
    $smoDatabase = $smoServer.Databases[$Database]
    
    if (-not $smoDatabase) {
        throw "Database '$Database' not found on server '$ServerInstance'"
    }
    
    Write-Host "Connected to database: $Database"
    
    # Step 3: Create Column Master Key using T-SQL
    Write-Host "Creating Column Master Key using T-SQL..."
    
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
        $smoDatabase.ExecuteNonQuery($dropCmkSql)
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
        $smoDatabase.ExecuteNonQuery($createCmkSql)
        Write-Host "Column Master Key created successfully: $cmkName"
    } catch {
        Write-Error "Failed to create Column Master Key: $($_.Exception.Message)"
        throw
    }
    
    # Step 4: Create Column Encryption Key using T-SQL
    Write-Host "Creating Column Encryption Key using T-SQL..."
    
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
        $smoDatabase.ExecuteNonQuery($dropCekSql)
    } catch {
        Write-Warning "Could not drop existing CEK (may not exist): $($_.Exception.Message)"
    }
    
    # Create CEK using T-SQL
    $createCekSql = @"
CREATE COLUMN ENCRYPTION KEY [$cekName]
WITH VALUES (
    COLUMN_MASTER_KEY = [$cmkName],
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x
)
"@
    
    try {
        $smoDatabase.ExecuteNonQuery($createCekSql)
        Write-Host "Column Encryption Key created successfully: $cekName"
    } catch {
        Write-Error "Failed to create Column Encryption Key: $($_.Exception.Message)"
        Write-Host "Trying alternative approach..."
        
        # Alternative: Let SQL Server generate the encrypted value
        $createCekAltSql = @"
DECLARE @encrypted_value VARBINARY(8000);
EXEC sp_column_encryption_key_value 
    @column_master_key = '$cmkName',
    @algorithm = 'RSA_OAEP', 
    @encrypted_value = @encrypted_value OUTPUT;

CREATE COLUMN ENCRYPTION KEY [$cekName]
WITH VALUES (
    COLUMN_MASTER_KEY = [$cmkName],
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = @encrypted_value
);
"@
        
        try {
            $smoDatabase.ExecuteNonQuery($createCekAltSql)
            Write-Host "Column Encryption Key created successfully with alternative method: $cekName"
        } catch {
            Write-Error "Alternative CEK creation also failed: $($_.Exception.Message)"
            throw
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
    cmk.key_store_provider_name,
    cmk.key_path
FROM sys.column_encryption_keys cek
INNER JOIN sys.column_encryption_key_values cekv ON cek.column_encryption_key_id = cekv.column_encryption_key_id
INNER JOIN sys.column_master_keys cmk ON cekv.column_master_key_id = cmk.column_master_key_id
WHERE cek.name = '$cekName'
"@
    
    $verifyResults = $smoDatabase.ExecuteWithResults($verifySql)
    
    if ($verifyResults.Tables[0].Rows.Count -eq 2) {
        Write-Host "✅ Both Column Master Key and Column Encryption Key created successfully"
        foreach ($row in $verifyResults.Tables[0].Rows) {
            Write-Host "  $($row.KeyType): $($row.name)"
        }
    } else {
        throw "Key verification failed. Expected 2 keys, found $($verifyResults.Tables[0].Rows.Count)"
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
        $smoDatabase.ExecuteNonQuery($createTableSql)
        Write-Host "✅ Test table 'dbo.test_encrypted' created successfully"
    } catch {
        Write-Error "Failed to create test table: $($_.Exception.Message)"
        throw
    }
    
    # Step 7: Insert test data (Note: This requires Always Encrypted enabled connection)
    Write-Host "Note: Test data insertion requires an Always Encrypted enabled connection from your application"
    Write-Host "The table structure is ready for encrypted data insertion from Node.js"
    
    # Step 8: Display setup information
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
    Write-Host "Node.js Test Code for inserting encrypted data:"
    Write-Host @"
const sql = require('msnodesqlv8');
const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=$ServerInstance;Database=$Database;UID=$Username;PWD=$Password;TrustServerCertificate=yes;ColumnEncryption=Enabled;';

// Insert encrypted data
const insertSql = ``INSERT INTO dbo.test_encrypted (name_encrypted, email_encrypted, name_plain) VALUES (?, ?, ?)``;
sql.query(connectionString, insertSql, ['John Doe', 'john@example.com', 'John Plain'], (err, result) => {
    if (err) console.error('Insert error:', err);
    else console.log('Data inserted successfully');
    
    // Query encrypted data
    sql.query(connectionString, 'SELECT * FROM dbo.test_encrypted', (err, results) => {
        if (err) console.error('Query error:', err);
        else console.log('Encrypted data retrieved:', results);
    });
});
"@
    
} catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    Write-Host "Full error details:"
    Write-Host $_.Exception.ToString()
    exit 1
} finally {
    # Ensure connection is closed
    if ($smoServer -and $smoServer.ConnectionContext.IsOpen) {
        $smoServer.ConnectionContext.Disconnect()
    }
}

Write-Host ""
Write-Host "Setup completed successfully! ✅"