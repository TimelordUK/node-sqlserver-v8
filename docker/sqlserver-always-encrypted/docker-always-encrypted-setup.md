# Docker SQL Server Setup with Always Encrypted

This guide helps you set up a SQL Server instance in Docker with Always Encrypted enabled for testing the encrypt.test.js suite.

## 1. Start SQL Server in Docker

```bash
# Pull the latest SQL Server 2022 image
docker pull mcr.microsoft.com/mssql/server:2022-latest

# Run SQL Server with a strong password
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=YourStrong@Passw0rd" \
   -p 1433:1433 --name sql_always_encrypted \
   -d mcr.microsoft.com/mssql/server:2022-latest
```

## 2. Connect to SQL Server and Create Test Database

```bash
# Connect to the SQL Server instance
docker exec -it sql_always_encrypted /opt/mssql-tools/bin/sqlcmd \
   -S localhost -U sa -P YourStrong@Passw0rd
```

Once connected, run:
 sql
-- Create test database
CREATE DATABASE TestAlwaysEncrypted;
GO

USE TestAlwaysEncrypted;
GO
```

## 3. Create Column Master Key (CMK) and Column Encryption Key (CEK)

```sql
-- Create a self-signed certificate for Column Master Key
-- Note: In production, use a proper certificate from a certificate authority
CREATE COLUMN MASTER KEY CMK_Auto1
WITH (
    KEY_STORE_PROVIDER_NAME = 'MSSQL_CERTIFICATE_STORE',
    KEY_PATH = 'CurrentUser/My/A66BB0F6E40266C94E153D7A3F49D3CE1F765C86'
);
GO

-- For testing purposes, we'll use a simpler approach with a symmetric key
-- First, let's create the CMK using a different approach that works in Docker

-- Alternative approach: Create CMK using MSSQL_CERTIFICATE_STORE is not available in Docker
-- Instead, we'll prepare the setup for use with a client-side certificate
```

## 4. Simplified Setup for Docker Testing

Since Docker SQL Server doesn't have access to Windows Certificate Store, here's a simplified approach:

### 4.1 Create setup script (save as setup-always-encrypted.sql)

```sql
USE TestAlwaysEncrypted;
GO

-- Note: The actual CMK and CEK creation needs to be done from a Windows client
-- with SQL Server Management Studio (SSMS) or PowerShell with proper certificates

-- For now, let's create the table structure that will be used once encryption is set up
CREATE TABLE test_encrpted_table (
    id INT IDENTITY(1,1) PRIMARY KEY,
    field NVARCHAR(100)
);
GO

-- Create a stored procedure template
CREATE PROCEDURE proc_insert_test_encrpted_table
    @field NVARCHAR(100)
AS
BEGIN
    INSERT INTO test_encrpted_table (field) VALUES (@field);
END;
GO
```

### 4.2 PowerShell Script for Setting up Always Encrypted (run from Windows client)

Save this as `setup-always-encrypted.ps1`:

```powershell
# Install SqlServer module if not already installed
if (!(Get-Module -ListAvailable -Name SqlServer)) {
    Install-Module -Name SqlServer -AllowClobber -Force
}

Import-Module SqlServer

# Connection parameters
$serverInstance = "localhost,1433"
$databaseName = "TestAlwaysEncrypted"
$connectionString = "Server=$serverInstance;Database=$databaseName;User ID=sa;Password=YourStrong@Passw0rd;TrustServerCertificate=true"

# Create a self-signed certificate for testing
$cert = New-SelfSignedCertificate -Subject "CN=Always Encrypted Test Certificate" `
    -CertStoreLocation Cert:CurrentUser\My `
    -KeyExportPolicy Exportable `
    -Type DocumentEncryptionCert `
    -KeyUsage KeyEncipherment `
    -KeySpec KeyExchange

Write-Host "Certificate created with thumbprint: $($cert.Thumbprint)"

# Connect to SQL Server
$sqlConnection = New-Object System.Data.SqlClient.SqlConnection
$sqlConnection.ConnectionString = $connectionString
$sqlConnection.Open()

# Create Column Master Key
$cmkSettings = New-SqlCertificateStoreColumnMasterKeySettings `
    -CertificateStoreLocation "CurrentUser" `
    -Thumbprint $cert.Thumbprint

$cmkName = "CMK_Auto1"
New-SqlColumnMasterKey -Name $cmkName `
    -InputObject $sqlConnection `
    -ColumnMasterKeySettings $cmkSettings

# Create Column Encryption Key
$cekName = "CEK_Auto1"
New-SqlColumnEncryptionKey -Name $cekName `
    -InputObject $sqlConnection `
    -ColumnMasterKey $cmkName

Write-Host "Column Master Key and Column Encryption Key created successfully"

# Now alter the table to add encryption
$alterTableQuery = @"
ALTER TABLE test_encrpted_table
ALTER COLUMN field NVARCHAR(100) 
COLLATE Latin1_General_BIN2
ENCRYPTED WITH (
    COLUMN_ENCRYPTION_KEY = [CEK_Auto1],
    ENCRYPTION_TYPE = Deterministic,
    ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
);
"@

$sqlCommand = $sqlConnection.CreateCommand()
$sqlCommand.CommandText = $alterTableQuery
$sqlCommand.ExecuteNonQuery()

$sqlConnection.Close()

Write-Host "Table column encrypted successfully"
Write-Host "Certificate Thumbprint to use in connection string: $($cert.Thumbprint)"
```

## 5. Connection String for Testing

After running the PowerShell script, use this connection string format in your tests:

```javascript
const connectionString = `Driver={ODBC Driver 18 for SQL Server};
Server=localhost,1433;
Database=TestAlwaysEncrypted;
Uid=sa;
Pwd=YourStrong@Passw0rd;
Encrypt=yes;
TrustServerCertificate=yes;
ColumnEncryption=Enabled;`;
```

## 6. Alternative: Simple Test Setup Without Windows

If you don't have access to a Windows machine, you can create a mock test that verifies the Always Encrypted code paths without actual encryption:

```sql
-- In SQL Server (via docker exec)
USE TestAlwaysEncrypted;
GO

-- Create regular table for testing the code paths
CREATE TABLE test_encrpted_table (
    id INT IDENTITY(1,1) PRIMARY KEY,
    field NVARCHAR(100)
);
GO

-- Create stored procedure
CREATE PROCEDURE proc_insert_test_encrpted_table
    @field NVARCHAR(100)
AS
BEGIN
    INSERT INTO test_encrpted_table (field) VALUES (@field);
END;
GO

-- Insert some test data
INSERT INTO test_encrpted_table (field) VALUES ('Test Value 1');
INSERT INTO test_encrpted_table (field) VALUES ('Test Value 2');
GO
```

## 7. Test Connection

```javascript
// test-connection.js
const sql = require('msnodesqlv8');

const connectionString = `Driver={ODBC Driver 18 for SQL Server};
Server=localhost,1433;
Database=TestAlwaysEncrypted;
Uid=sa;
Pwd=YourStrong@Passw0rd;
Encrypt=yes;
TrustServerCertificate=yes;`;

sql.open(connectionString, (err, conn) => {
    if (err) {
        console.error('Connection failed:', err);
        return;
    }
    
    console.log('Connected successfully!');
    
    conn.query('SELECT * FROM test_encrpted_table', (err, results) => {
        if (err) {
            console.error('Query failed:', err);
        } else {
            console.log('Results:', results);
        }
        conn.close(() => {
            console.log('Connection closed');
        });
    });
});
```

## Notes

1. **For full Always Encrypted testing**, you need:
   - A Windows client machine with SQL Server tools
   - ODBC Driver 17 or 18 for SQL Server installed
   - Access to Windows Certificate Store

2. **For basic testing** of the encrypt.test.js code paths without actual encryption:
   - Use the Docker setup above
   - The tests will run but won't actually encrypt/decrypt data
   - This is sufficient to verify the code compiles and runs with NAPI

3. **Connection String Parameters**:
   - `ColumnEncryption=Enabled` - Required for Always Encrypted
   - `TrustServerCertificate=yes` - For self-signed certificates in test environments
   - `Encrypt=yes` - Ensures connection is encrypted

4. **Troubleshooting**:
   - Ensure ODBC Driver 17 or 18 is installed
   - Check that the certificate thumbprint matches if using Always Encrypted
   - Verify the database and table names match your test configuration
