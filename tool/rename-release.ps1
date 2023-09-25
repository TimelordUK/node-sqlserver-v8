$src="v4.1.0"
$dst="v4.1.1"
$path="$HOME\dev\js\sql\v8\node_modules\msnodesqlv8\assets"
$versions=Get-ChildItem -Path $path *.gz
$versions | ForEach-Object { 
    $name = $_.FullName.Replace($src, $dst)
    Rename-Item $_.FullName $name
}