$src="v4.2.0"
$dst="v4.2.1"
$path="$HOME\dev\js\sql\v8\node_modules\msnodesqlv8\prebuilds"
$versions=Get-ChildItem -Path $path *.gz
$versions | ForEach-Object { 
    $name = $_.FullName.Replace($src, $dst)
    Rename-Item $_.FullName $name
}
