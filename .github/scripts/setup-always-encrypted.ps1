<#
  Sets up Always Encrypted keys for test/encrypt*.test.js, with no SqlServer module.

  1. Creates a self-signed certificate in CurrentUser\My to act as the column master key.
  2. Creates the column master key (CMK) pointing at that certificate.
  3. Generates a random 32-byte column encryption key, wraps it with the certificate
     (RSA-OAEP), signs it, and creates the column encryption key (CEK) from that value.

  The ENCRYPTED_VALUE layout is the one the ODBC driver's certificate store provider
  expects: version 0x01, key path length, ciphertext length, key path (lower-cased
  UTF-16LE), ciphertext, then an RSA PKCS#1 SHA-256 signature over everything before it.

  Only the client needs the certificate, so the tests must run as the same Windows user.
#>
param(
  [string]$Server = 'localhost',
  [string]$Database = 'node',
  [string]$User = 'sa',
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$CmkName = 'CMK_Auto1',
  [string]$CekName = 'CEK_Auto1',
  [string]$Subject = 'CN=msnodesqlv8 Always Encrypted test CMK'
)

$ErrorActionPreference = 'Stop'

function Invoke-Sql ([string]$query) {
  $out = & sqlcmd -S $Server -U $User -P $Password -d $Database -C -b -Q $query 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "sqlcmd failed ($LASTEXITCODE): $out"
  }
  $out
}

$cert = New-SelfSignedCertificate -Subject $Subject `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyExportPolicy Exportable -Type DocumentEncryptionCert `
  -KeyUsage KeyEncipherment, DataEncipherment -KeySpec KeyExchange `
  -KeyLength 2048 -HashAlgorithm sha256 `
  -Provider 'Microsoft Enhanced RSA and AES Cryptographic Provider'
Write-Host "Created certificate $($cert.Thumbprint)"

$keyPath = "CurrentUser/My/$($cert.Thumbprint)"
$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)

$cek = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($cek)
$ciphertext = $rsa.Encrypt($cek, [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA1)
$keyPathBytes = [System.Text.Encoding]::Unicode.GetBytes($keyPath.ToLowerInvariant())

$stream = New-Object System.IO.MemoryStream
$stream.WriteByte(1)
$stream.Write([BitConverter]::GetBytes([uint16]$keyPathBytes.Length), 0, 2)
$stream.Write([BitConverter]::GetBytes([uint16]$ciphertext.Length), 0, 2)
$stream.Write($keyPathBytes, 0, $keyPathBytes.Length)
$stream.Write($ciphertext, 0, $ciphertext.Length)
$message = $stream.ToArray()
$signature = $rsa.SignData($message,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$encryptedValue = '0x' + (($message + $signature | ForEach-Object { $_.ToString('X2') }) -join '')

Invoke-Sql "IF EXISTS (SELECT 1 FROM sys.column_encryption_keys WHERE name = '$CekName') DROP COLUMN ENCRYPTION KEY [$CekName];
IF EXISTS (SELECT 1 FROM sys.column_master_keys WHERE name = '$CmkName') DROP COLUMN MASTER KEY [$CmkName];" | Out-Null
Invoke-Sql "CREATE COLUMN MASTER KEY [$CmkName] WITH (KEY_STORE_PROVIDER_NAME = 'MSSQL_CERTIFICATE_STORE', KEY_PATH = '$keyPath');" | Out-Null
Invoke-Sql "CREATE COLUMN ENCRYPTION KEY [$CekName] WITH VALUES (COLUMN_MASTER_KEY = [$CmkName], ALGORITHM = 'RSA_OAEP', ENCRYPTED_VALUE = $encryptedValue);" | Out-Null
Write-Host "Created $CmkName and $CekName in [$Database]"
