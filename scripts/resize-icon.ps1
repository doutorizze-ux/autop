Add-Type -AssemblyName System.Drawing
$imgPath = Resolve-Path "build/icon.png"
$src = [System.Drawing.Image]::FromFile($imgPath)
$dest = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($src, 0, 0, 512, 512)
$g.Dispose()
$src.Dispose()
$dest.Save("build/icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()
Write-Output "Resized successfully to 512x512"
