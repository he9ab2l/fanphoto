param(
    [string]$DestDir = (Join-Path $PSScriptRoot "..\test-photo\scenic"),
    [int]$Quality = 95
)
# 下载 50 张不同长宽比的风景测试图（Unsplash 高画质 JPEG）。
# 覆盖横图 / 竖图 / 方形 / 超宽全景 / 超窄长图，已存在且校验通过的文件会跳过。
# 用法：pwsh -NoProfile -File scripts/download_scenic_photos.ps1
$dest = [System.IO.Path]::GetFullPath($DestDir)
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$ids = @(
    "1506905925346-21bda4d32df4", "1501785888041-af3ef285b470",
    "1441974231531-c6227db76b6e", "1470071459604-3b5ec3a7fe05",
    "1519681393784-d120267933ba", "1472214103451-9374bd1c798e",
    "1469474968028-56623f02e42e", "1507525428034-b723cf961d3e",
    "1519046904884-53103b34b206", "1433086966358-54859d0ed716",
    "1508739773434-c26b3d09e071", "1454496522488-7a8e488e8606",
    "1426604966848-d7adac402bff", "1447752875215-b2761acb3c5d",
    "1475924156734-496f6cac6ec1", "1476514525535-07fb3b4ae5f1",
    "1502082553048-f009c37129b9", "1465146344425-f00d5f5c8f07",
    "1448375240586-882707db888b", "1501854140801-50d01698950b"
)
$ids += @(
    "1458668383970-8ddd3927deed", "1439066615861-d1af74d74000",
    "1446329813274-7c9036bd9a1f", "1470252649378-9c29740c9fa8",
    "1500530855697-b586d89ba3ee", "1487958449943-2429e8be8625",
    "1493246507139-91e8fad9978e", "1470770841072-f978cf4d019e",
    "1483728642387-6c3bdd6c93e5", "1464822759023-fed622ff2c3b"
)
$ids += @(
    "1506905925346-21bda4d32df4", "1501785888041-af3ef285b470",
    "1441974231531-c6227db76b6e", "1470071459604-3b5ec3a7fe05",
    "1519681393784-d120267933ba", "1472214103451-9374bd1c798e",
    "1469474968028-56623f02e42e", "1507525428034-b723cf961d3e",
    "1519046904884-53103b34b206", "1433086966358-54859d0ed716",
    "1508739773434-c26b3d09e071", "1454496522488-7a8e488e8606",
    "1426604966848-d7adac402bff", "1447752875215-b2761acb3c5d",
    "1475924156734-496f6cac6ec1", "1476514525535-07fb3b4ae5f1",
    "1502082553048-f009c37129b9", "1465146344425-f00d5f5c8f07",
    "1448375240586-882707db888b", "1501854140801-50d01698950b"
)

$sizes = @(
    "2400x1350", "2560x1440", "2200x1600", "2400x1800",
    "2000x2000", "2400x2400", "1600x2400", "1400x2200",
    "1200x2600", "1000x2800", "3200x1200", "3600x1400",
    "2800x1000", "1800x1200", "2000x2600", "2600x1800",
    "1600x2000", "1200x2400", "2200x2600", "2600x1600"
)
$sizes += @(
    "3200x1800", "1920x1080", "2560x1707", "2048x1365", "3000x2000",
    "1800x1800", "2200x2200", "1700x2400", "1500x2300", "1300x2500",
    "1100x2400", "900x2600", "3400x1300", "3000x1100", "2600x900",
    "2100x1400", "2800x1600", "1900x2400", "1700x2100", "1600x2600",
    "1400x2700", "1200x2000", "2500x1700", "2300x1500", "2000x1300",
    "2700x1600", "3200x1000", "2400x1100", "1800x2000", "2200x2000"
)

function Test-JpegFile([string]$Path) {
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        $b = New-Object byte[] 2
        $fs.Read($b, 0, 2) | Out-Null
        $fs.Close()
        return ($b[0] -eq 0xFF -and $b[1] -eq 0xD8)
    } catch { return $false }
}

$ok = 0; $skip = 0; $fail = 0
for ($i = 0; $i -lt $ids.Count; $i++) {
    $nn = "{0:D2}" -f ($i + 1)
    $out = Join-Path $dest "photo-$nn.jpg"
    $tmp = Join-Path $dest "photo-$nn.tmp"
    $w, $h = $sizes[$i].Split('x')

    if ((Test-Path -LiteralPath $out) -and (Test-JpegFile $out)) {
        Write-Output ("SKIP photo-{0}.jpg (已存在)" -f $nn)
        $skip++
        continue
    }

    $url = "https://images.unsplash.com/photo-$($ids[$i])?q=$Quality&w=$w&h=$h&auto=format&fit=crop&fm=jpg"
    curl.exe -sSL --connect-timeout 15 --max-time 240 --retry 3 --retry-all-errors -o "$tmp" "$url" 2>$null
    $len = (Get-Item -LiteralPath $tmp -ErrorAction SilentlyContinue).Length
    if ($len -gt 60000 -and (Test-JpegFile $tmp)) {
        Move-Item -LiteralPath $tmp -Destination $out -Force
        Write-Output ("OK   photo-{0}.jpg  {1} x {2}  {3} KB" -f $nn, $w, $h, [int]($len / 1KB))
        $ok++
    } else {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        Write-Output ("FAIL photo-{0}.jpg  {1}x{2}" -f $nn, $w, $h)
        $fail++
    }
}
Write-Output "done: ok=$ok skip=$skip fail=$fail"
