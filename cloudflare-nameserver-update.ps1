#!/usr/bin/env pwsh
<#
.SYNOPSIS
Cloudflare kadrio.com nameserver'ını chris/kenia olarak güncelle

.DESCRIPTION
Cloudflare API'ı kullanarak nameserver'ları keaton/natasha'dan chris/kenia'ya değiştirir

.NOTES
Önce token oluştur:
https://dash.cloudflare.com/profile/api-tokens
- 'Edit zone DNS' template seç
- Zone Resources: kadrio.com
- Permissions: Zone:DNS, Zone:Registrar Nameserver

Sonra token'ı $env:CLOUDFLARE_API_TOKEN olarak set et
#>

param(
    [string]$Token = $env:CLOUDFLARE_API_TOKEN
)

$ErrorActionPreference = "Stop"

# Konfigürasyon
$domain = "kadrio.com"
$newNameservers = @("chris.ns.cloudflare.com", "kenia.ns.cloudflare.com")
$apiUrl = "https://api.cloudflare.com/client/v4"

Write-Host "╔════════════════════════════════════════════════════════╗"
Write-Host "║  Cloudflare Nameserver Güncelleme Scripti             ║"
Write-Host "║  Domain: $domain"
Write-Host "╚════════════════════════════════════════════════════════╝"
Write-Host ""

# Token kontrolü
if (-not $Token) {
    Write-Host "❌ HATA: API Token bulunamadı"
    Write-Host ""
    Write-Host "Token oluşturmak için:"
    Write-Host "1. https://dash.cloudflare.com/profile/api-tokens"
    Write-Host "2. 'Create Token' tıkla"
    Write-Host "3. 'Edit zone DNS' template seç"
    Write-Host "4. Zone Resources: kadrio.com seç"
    Write-Host "5. Token'ı kopyala"
    Write-Host ""
    Write-Host "Sonra çalıştır:"
    Write-Host "`$env:CLOUDFLARE_API_TOKEN = 'YOUR_TOKEN_HERE'"
    Write-Host "& '$(Split-Path $MyInvocation.MyCommand.Path)\$(Split-Path $MyInvocation.MyCommand.Path -Leaf)'"
    exit 1
}

# API Headers
$headers = @{
    'Authorization' = "Bearer $Token"
    'Content-Type'   = 'application/json'
}

try {
    # Adım 1: Zone ID bul
    Write-Host "📍 Adım 1: Zone ID aranıyor ($domain)..."
    $zonesResp = Invoke-RestMethod -Uri "$apiUrl/zones?name=$domain" `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 10

    if (-not $zonesResp.success) {
        throw "Zone lookup başarısız: $($zonesResp.errors[0].message)"
    }

    if ($zonesResp.result.Count -eq 0) {
        throw "Zone bulunamadı: $domain"
    }

    $zoneId = $zonesResp.result[0].id
    Write-Host "✓ Zone ID: $zoneId"
    Write-Host ""

    # Adım 2: Mevcut nameserver'ları göster
    Write-Host "📍 Adım 2: Mevcut Nameserver'lar kontrol ediliyor..."
    $dnsResp = Invoke-RestMethod -Uri "$apiUrl/zones/$zoneId/nameservers" `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 10

    if ($dnsResp.success) {
        Write-Host "Mevcut NS: $($dnsResp.result.nameservers -join ', ')"
    }
    Write-Host ""

    # Adım 3: Nameserver'ları güncelle
    Write-Host "📍 Adım 3: Nameserver'lar güncelleniyor..."
    Write-Host "Yeni NS: $($newNameservers -join ', ')"
    Write-Host ""

    $updateBody = @{
        nameservers = $newNameservers
    } | ConvertTo-Json

    $updateResp = Invoke-RestMethod -Uri "$apiUrl/zones/$zoneId/nameservers" `
        -Headers $headers `
        -Method PUT `
        -Body $updateBody `
        -TimeoutSec 10

    if (-not $updateResp.success) {
        throw "Nameserver güncelleme başarısız: $($updateResp.errors[0].message)"
    }

    Write-Host "✅ Nameserver'lar başarıyla güncellendi!"
    Write-Host "Güncellenen NS: $($updateResp.result.nameservers -join ', ')"
    Write-Host ""

    # Adım 4: Doğrulama
    Write-Host "📍 Adım 4: Doğrulama (Public DNS)..."
    Start-Sleep -Seconds 2

    try {
        $nslookup = Resolve-DnsName $domain -Type NS -ErrorAction SilentlyContinue
        if ($nslookup) {
            $ns = $nslookup | Select-Object -ExpandProperty NameHost | Get-Unique
            Write-Host "Public DNS Nameserver'lar:"
            $ns | ForEach-Object { Write-Host "  ✓ $_" }
            
            if (($ns -contains "chris.ns.cloudflare.com") -or ($ns -contains "kenia.ns.cloudflare.com")) {
                Write-Host ""
                Write-Host "⚠️  DNS Propagasyonu: 5-48 saat sürebilir"
            }
        }
    } catch {
        Write-Host "DNS doğrulama başarısız, ama Cloudflare'de güncelleme tamamlandı"
    }

    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════╗"
    Write-Host "║ ✅ TAMAMLANDI                                          ║"
    Write-Host "╚════════════════════════════════════════════════════════╝"
    Write-Host ""
    Write-Host "Sonraki adım: https://kadrio.com HTTPS üzerinden açılması bekleyin"

} catch {
    Write-Host "❌ HATA: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
