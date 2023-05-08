$src="v3.1.0"
$dst="v4.0.0"
$path="C:\Users\sjame\dev\js\sql\v8\node_modules\msnodesqlv8\assets"
$versions=Get-ChildItem -Path $path *.gz
$versions | ForEach-Object { 
    $name = $_.FullName.Replace($src, $dst)
    Rename-Item $_.FullName $name
}