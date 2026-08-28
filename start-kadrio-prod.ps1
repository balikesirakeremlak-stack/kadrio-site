$env:NODE_ENV = "production"
$randomBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
if (-not $env:ADMIN_TOKEN) { $env:ADMIN_TOKEN = [Convert]::ToBase64String($randomBytes) }
$randomBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
if (-not $env:SESSION_SECRET) { $env:SESSION_SECRET = [Convert]::ToBase64String($randomBytes) }
$env:SINGLE_PRODUCT_NAME = "Kadrio Tek Ürün"
$env:SINGLE_PRODUCT_PRICE = "99"
$env:PAYMENT_LINK_URL = "https://www.shopier.com/kadrio/50337921"

Write-Host "Kadrio production server baslatiliyor..."
Write-Host "Urun: $env:SINGLE_PRODUCT_NAME"
Write-Host "Fiyat: $env:SINGLE_PRODUCT_PRICE TL"
Write-Host "Odeme linki: $env:PAYMENT_LINK_URL"

node server.js
