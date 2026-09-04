param(
    [string]$DestDir = (Join-Path $PSScriptRoot "..\test-photo"),
    [int]$Target = 20
)
$dest = [System.IO.Path]::GetFullPath($DestDir)
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$log = Join-Path $PSScriptRoot "gallery-download-log.txt"
Add-Content -LiteralPath $log -Value ("--- run " + (Get-Date -Format s) + " ---")

$unsplashIds = @(
    "1506905925346-21bda4d32df4", "1501785888041-af3ef285b470", "1441974231531-c6227db76b6e",
    "1470071459604-3b5ec3a7fe05", "1519681393784-d120267933ba", "1472214103451-9374bd1c798e",
    "1469474968028-56623f02e42e", "1507525428034-b723cf961d3e", "1519046904884-53103b34b206",
    "1433086966358-54859d0ed716", "1508739773434-c26b3d09e071", "1454496522488-7a8e488e8606",
    "1426604966848-d7adac402bff", "1447752875215-b2761acb3c5d", "1475924156734-496f6cac6ec1",
    "1476514525535-07fb3b4ae5f1", "1502082553048-f009c37129b9", "1465146344425-f00d5f5c8f07",
    "1448375240586-882707db888b", "1501854140801-50d01698950b", "1458668383970-8ddd3927deed",
    "1439066615861-d1af74d74000", "1446329813274-7c9036bd9a1f", "1470252649378-9c29740c9fa8",
    "1500530855697-b586d89ba3ee", "1487958449943-2429e8be8625", "1493246507139-91e8fad9978e",
    "1470770841072-f978cf4d019e", "1483728642387-6c3bdd6c93e5", "1464822759023-fed622ff2c3b"
)
$picsumIds = @(1015,1016,1018,1019,1020,1035,1036,1039,1043,1044,1045,1050,1053,1055,1057,1059,1061,1063,1064,1065,1067,1069,1070,1071,1073,1074,1076,1080)

function Test-JpegFile([string]$Path) {
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        $b = New-Object byte[] 2
        $fs.Read($b, 0, 2) | Out-Null
        $fs.Close()
        return ($b[0] -eq 0xFF -and $b[1] -eq 0xD8)
    } catch { return $false }
}

function Save-Candidate([string]$Url, [int]$Index, [string]$Kind) {
    $name = ("gallery-{0:D2}.jpg" -f $Index)
    $out = Join-Path $dest $name
    $tmp = Join-Path $dest ("gallery-{0:D2}.tmp" -f $Index)
    curl.exe -sSL --connect-timeout 15 --max-time 240 --retry 3 --retry-all-errors -o "$tmp" "$Url" 2>$null
    $len = (Get-Item -LiteralPath $tmp -ErrorAction SilentlyContinue).Length
    if ($len -gt 60000 -and (Test-JpegFile $tmp)) {
        [System.IO.File]::Move($tmp, $out)
        Add-Content -LiteralPath $log -Value ("$Kind`t$Url`t$name`t$len")
        Write-Output ("OK   {0} ({1}K) <- {2} {3}" -f $name, [int]($len/1024), $Kind, $Url)
        return $true
    }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    Write-Output ("FAIL {0} <- {1}" -f $name, $Url)
    return $false
}

$n = 0
foreach ($id in $unsplashIds) {
    if ($n -ge $Target) { break }
    $url = "https://images.unsplash.com/photo-$id`?q=80&w=1800&auto=format&fit=max&fm=jpg"
    if (Save-Candidate $url ($n + 1) "unsplash") { $n++ }
}
foreach ($id in $picsumIds) {
    if ($n -ge $Target) { break }
    $url = "https://picsum.photos/id/$id/1800"
    if (Save-Candidate $url ($n + 1) "picsum") { $n++ }
}
Write-Output ("done: downloaded=$n target=$Target")