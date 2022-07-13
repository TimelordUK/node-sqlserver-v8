$src = $args[0]
if ([string]::IsNullOrEmpty($src)) {
    $src = 'https://download.microsoft.com/download/E/6/B/E6BFDC7A-5BCD-4C51-9912-635646DA801E/en-US/17.5.2.1/x64/msodbcsql.msi'
}
Write-Host $src
Install-Product node $env:nodejs_version $env:platform
Write-Host "Installing ODBC driver..." -ForegroundColor Cyan
Write-Host "Downloading..."
$msiPath = "$($env:USERPROFILE)\msodbcsql.msi"
$msiLog = "$($env:USERPROFILE)\msodbcsql.txt"
(New-Object Net.WebClient).DownloadFile($src, $msiPath)
Write-Host "Installing..."
Get-Item -Path $msiPath
Write-Host $msiPath
msiexec /quiet /qn /norestart /log $msiLog /i $msiPath IACCEPTMSODBCSQLLICENSETERMS=YES
