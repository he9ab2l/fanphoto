param(
    [string]$DestDir = (Join-Path $PSScriptRoot "..\test-photo")
)
# keep default error handling (curl writes to stderr)
$dest = [System.IO.Path]::GetFullPath($DestDir)
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$jobs = @(
    @{ name = "beach.jpg";                       dst = "beach.jpg";                     repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Sony DigitalMavica.jpg";          dst = "Sony_DigitalMavica.jpg";        repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Olympus C2040Z.jpg";              dst = "Olympus_C2040Z.jpg";            repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Pentax Optio S4.jpg";             dst = "Pentax_Optio_S4.jpg";           repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Canon PowerShot S330.jpg";        dst = "Canon_PowerShot_S330.jpg";      repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "FujiFilm FinePix40i.jpg";         dst = "FujiFilm_FinePix40i.jpg";       repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Canon IXUS 400.jpg";              dst = "Canon_IXUS_400.jpg";            repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Nikon E5000.jpg";                 dst = "Nikon_E5000.jpg";               repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Samsung GT-I9000 (Galaxy S).jpg"; dst = "Samsung_Galaxy_S_GT-I9000.jpg"; repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Canon PowerShot G2 (1).jpg";      dst = "Canon_PowerShot_G2.jpg";        repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Nikon Coolpix 775.jpg";           dst = "Nikon_Coolpix_775.jpg";         repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Nikon D70.jpg";                   dst = "Nikon_D70.jpg";                 repo = "drewnoakes/metadata-extractor-images"; branch = "main";  path = "jpg" },
    @{ name = "Canon_40D.jpg";                   dst = "exif_Canon_40D.jpg";            repo = "ianare/exif-samples"; branch = "master"; path = "jpg" },
    @{ name = "Nikon_D70.jpg";                   dst = "exif_Nikon_D70.jpg";            repo = "ianare/exif-samples"; branch = "master"; path = "jpg" },
    @{ name = "Olympus_C8080WZ.jpg";             dst = "exif_Olympus_C8080WZ.jpg";      repo = "ianare/exif-samples"; branch = "master"; path = "jpg" },
    @{ name = "Reconyx_HC500_Hyperfire.jpg";     dst = "exif_Reconyx_HC500.jpg";        repo = "ianare/exif-samples"; branch = "master"; path = "jpg" },
    @{ name = "corrupted.jpg";                   dst = "exif_corrupted_test.jpg";       repo = "ianare/exif-samples"; branch = "master"; path = "jpg" },
    @{ name = "DSCN0010.jpg";                    dst = "exif_gps_DSCN0010.jpg";         repo = "ianare/exif-samples"; branch = "master"; path = "jpg/gps" },
    @{ name = "DSCN0029.jpg";                    dst = "exif_gps_DSCN0029.jpg";         repo = "ianare/exif-samples"; branch = "master"; path = "jpg/gps" },
    @{ name = "DSCN0042.jpg";                    dst = "exif_gps_DSCN0042.jpg";         repo = "ianare/exif-samples"; branch = "master"; path = "jpg/gps" },
    @{ name = "landscape_4.jpg";                 dst = "exif_orient_landscape_4.jpg";   repo = "ianare/exif-samples"; branch = "master"; path = "jpg/orientation" },
    @{ name = "portrait_2.jpg";                  dst = "exif_orient_portrait_2.jpg";    repo = "ianare/exif-samples"; branch = "master"; path = "jpg/orientation" }
)
$ok = 0; $fail = 0
foreach ($jb in $jobs) {
    $out = Join-Path $dest $jb.dst
    if (Test-Path -LiteralPath $out) { Write-Output "SKIP $($jb.dst)"; $ok++; continue }
    $enc = [uri]::EscapeDataString($jb.name)
    $cdn = "https://cdn.jsdelivr.net/gh/$($jb.repo)@$($jb.branch)/$($jb.path)/$enc"
    $raw = "https://raw.githubusercontent.com/$($jb.repo)/$($jb.branch)/$($jb.path)/$enc"
    $downloaded = $false
    foreach ($src in @($cdn, $raw)) {
        for ($i = 1; $i -le 3 -and -not $downloaded; $i++) {
            curl.exe -sSL --connect-timeout 10 --max-time 120 --retry 2 --retry-all-errors -o "$out" "$src" 2>$null
            $len = (Get-Item -LiteralPath $out -ErrorAction SilentlyContinue).Length
            if ($len -gt 1000) { $downloaded = $true }
            else { Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue }
        }
        if ($downloaded) { break }
    }
    if ($downloaded) { Write-Output ("OK   {0} ({1} bytes)" -f $jb.dst, (Get-Item -LiteralPath $out).Length); $ok++ }
    else { Write-Output "FAIL $($jb.dst)"; $fail++ }
}
Write-Output "done: ok=$ok fail=$fail"