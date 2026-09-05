param(
    [string]$Dir = (Join-Path $PSScriptRoot "..\test-photo\scenic")
)
# 把 test-photo/scenic 下的照片统一命名为 photo-001.jpg ... photo-070.jpg。
# 已符合 photo-NNN.jpg 命名的文件保持不变；可重复运行。
# 用法：pwsh -NoProfile -File scripts/rename_scenic_photos.ps1
$dir = [System.IO.Path]::GetFullPath($Dir)
if (-not (Test-Path -LiteralPath $dir)) {
    Write-Error "目录不存在: $dir"
    exit 1
}

$files = Get-ChildItem -LiteralPath $dir -File -Filter *.jpg
$done = $files | Where-Object { $_.Name -match '^photo-\d{3}\.jpg$' }
$todo = $files | Where-Object { $_.Name -notmatch '^photo-\d{3}\.jpg$' } | Sort-Object Name

$next = 1
if ($done) {
    $max = ($done | ForEach-Object { [int]($_.BaseName -replace '^photo-', '') } | Measure-Object -Maximum).Maximum
    $next = $max + 1
}

$renamed = 0
foreach ($f in $todo) {
    $newName = "photo-{0:D3}.jpg" -f $next
    Rename-Item -LiteralPath $f.FullName -NewName $newName
    Write-Output ("{0} -> {1}" -f $f.Name, $newName)
    $next++
    $renamed++
}

$total = (Get-ChildItem -LiteralPath $dir -File -Filter *.jpg).Count
Write-Output "done: renamed=$renamed total=$total"
