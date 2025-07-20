# SQL Server with Always Encrypted - Docker Setup

This directory contains a complete Docker setup for SQL Server 2022 with Always Encrypted functionality, specifically configured for msnodesqlv8 testing.

## Quick Start

**Run this single command to set everything up from scratch:**

```powershell
.\start.ps1
```

This will:
1. 📁 Create local directories for SQL Server data persistence
2. 🐳 Pull and start SQL Server 2022 Docker container  
3. 🔐 Set up Always Encrypted with certificates and keys
4. 🧪 Create test tables and provide test scripts

## What Gets Created

### Local Directory Structure
```
%USERPROFILE%\sqlserver\
├── data\     # SQL Server database files
├── log\      # SQL Server log files  
└── backup\   # SQL Server backup files
```

### Docker Container
- **Container Name**: `sqlserver-always-encrypted`
- **Image**: `mcr.microsoft.com/mssql/server:2022-latest`
- **Port**: `1433` (mapped to host)
- **SA Password**: `Password_123#`

### Database Setup
- **Database**: `node` (created automatically)
- **Test Table**: `dbo.test_basic` (with sample data)
- **Encrypted Table**: `dbo.test_encrypted` (Always Encrypted columns)

### Always Encrypted Components
- **Certificate**: Self-signed certificate in local certificate store
- **Column Master Key**: `CMK_Auto1`
- **Column Encryption Key**: `CEK_Auto1`
- **Encrypted Columns**: `name_encrypted` (deterministic), `email_encrypted` (randomized)

## Connection Strings

### Basic Connection (no encryption)
```
Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;
```

### Always Encrypted Connection
```
Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;ColumnEncryption=Enabled;
```

## Testing

### Test Always Encrypted Functionality
```powershell
node .\scripts\test-always-encrypted.js
```

### Test Basic Connection
```bash
docker exec sqlserver-always-encrypted /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Password_123#" -d node -Q "SELECT COUNT(*) FROM dbo.test_basic"
```

## Manual Steps (if needed)

### 1. Start Container Only
```powershell
.\start.ps1 -SkipAlwaysEncrypted
```

### 2. Set Up Always Encrypted Only
```powershell
.\scripts\setup-always-encrypted.ps1
```

### 3. Create Directories Only
```powershell
.\start.ps1 -SkipContainerStart -SkipAlwaysEncrypted
```

## Docker Management

### View Container Logs
```bash
docker logs sqlserver-always-encrypted
```

### Stop Container
```bash
docker-compose down
```

### Restart Container
```bash
docker-compose restart
```

### Connect to Container Shell
```bash
docker exec -it sqlserver-always-encrypted /bin/bash
```

### Connect via sqlcmd
```bash
docker exec -it sqlserver-always-encrypted /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Password_123#"
```

## Files Structure

```
sqlserver-always-encrypted/
├── docker-compose.yml                    # Docker Compose configuration
├── start.ps1                            # Main setup script
├── README.md                            # This file
├── init-scripts/
│   └── 01-create-database.sql           # Database initialization
└── scripts/
    ├── setup-always-encrypted.ps1       # Always Encrypted setup
    └── test-always-encrypted.js         # Node.js test script
```

## Prerequisites

### Windows
- Docker Desktop for Windows
- PowerShell 5.1+ or PowerShell 7+
- SQL Server PowerShell module: `Install-Module -Name SqlServer -Force`

### Node.js Testing
- Node.js 14+ 
- msnodesqlv8 module
- ODBC Driver 18 for SQL Server

## Troubleshooting

### Container Won't Start
```bash
# Check Docker is running
docker version

# Check available resources
docker system df

# View detailed container logs
docker logs sqlserver-always-encrypted --details
```

### SQL Server Connection Issues
```bash
# Test container health
docker exec sqlserver-always-encrypted /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "Password_123#" -Q "SELECT @@VERSION"

# Check if port is accessible
telnet 127.0.0.1 1433
```

### Always Encrypted Issues
```powershell
# Verify certificate exists
Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -like "*msnodesqlv8_AE_Certificate*"

# Re-run setup
.\scripts\setup-always-encrypted.ps1
```

### Data Persistence Issues
```powershell
# Check directory permissions
Get-Acl "$env:USERPROFILE\sqlserver"

# Verify volume mounts
docker inspect sqlserver-always-encrypted | Select-String -Pattern "Mounts" -A 10
```

## Clean Up

### Remove Everything
```bash
# Stop and remove container
docker-compose down

# Remove container and image
docker rmi mcr.microsoft.com/mssql/server:2022-latest

# Remove local data (optional)
# Remove-Item "$env:USERPROFILE\sqlserver" -Recurse -Force
```

## Integration with msnodesqlv8

This setup is specifically designed for testing msnodesqlv8 with Always Encrypted. Use the provided connection strings in your Node.js applications:

```javascript
const sql = require('msnodesqlv8');

const connectionString = 'Driver={ODBC Driver 18 for SQL Server};Server=127.0.0.1,1433;Database=node;UID=sa;PWD=Password_123#;TrustServerCertificate=yes;ColumnEncryption=Enabled;';

// Your msnodesqlv8 code here
sql.query(connectionString, 'SELECT * FROM dbo.test_encrypted', callback);
```

## Security Notes

- 🔒 The SA password `Password_123#` is for development only
- 🔑 Self-signed certificates are for testing only  
- 🚫 Do not use this setup in production environments
- 🔐 Always Encrypted keys are stored in local certificate store

## Support

This setup provides a complete development environment for testing Always Encrypted functionality with msnodesqlv8. All components are configured to work together seamlessly.