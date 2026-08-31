# Kadrio Play Store Veri Guvenligi Taslagi

Bu dosya Play Console Veri Guvenligi formu icin hazirlik notudur.

## Toplanan / Islenen Veri Turleri

### Hesap Bilgileri

- Kullanici adi
- E-posta adresi
- Sifre hash'i

Kullanim amaci:
- Hesap olusturma
- Giriş yapma
- Kullanici oturumu yonetimi

### Kullanici Icerigi

- Reel basligi
- Reel aciklamasi
- Reel etiketleri
- Yuklenen video dosyasi
- Yorumlar
- Raporlama nedenleri

Kullanim amaci:
- Icerik yayinlama
- Icerik moderasyonu
- Topluluk guvenligi

### Uygulama Etkilesimi ve Analitik

- Ziyaret / attribution olayi
- Uygulama ici tiklama ve akis istekleri
- IP adresi ve user-agent gibi teknik log bilgileri

Kullanim amaci:
- Hizmeti calistirma
- Kotuye kullanim onleme
- Temel performans ve kullanim analizi

### Odeme Bilgileri

Kadrio kart bilgisi toplamaz veya saklamaz. Odeme Shopier uzerinden tamamlanir.

Kullanim amaci:
- Kullanici Shopier odeme sayfasina yonlendirilir
- Odeme bilgileri Shopier tarafindan islenir

## Veri Paylasimi

- Odeme sureci icin kullanici Shopier'e yonlendirilir.
- Barindirma ve altyapi icin Railway kullanilir.
- DNS, CDN ve guvenlik katmani icin Cloudflare kullanilir.

## Guvenlik

- HTTPS aktif
- Cloudflare uzerinden yayin
- Sifreler hashlenerek saklanir
- Admin token gerektiren yonetim endpointleri vardir
- Kamera, mikrofon ve konum izinleri uygulama tarafindan istenmez

## Kullanici Silme / Destek

Kullanici hesap veya veri silme talebi icin destek e-postasi:

balikesirakeremlak@gmail.com

## Play Console Formuna Uygun Kisa Cevaplar

- Uygulama veri topluyor mu? Evet
- Veri sifrelenerek aktariliyor mu? Evet, HTTPS
- Kullanici veri silme talep edebilir mi? Evet, destek e-postasi ile
- Odeme bilgisi toplaniyor mu? Hayir, Shopier tarafindan islenir
- Konum verisi toplaniyor mu? Hayir
- Kamera/mikrofon kullaniliyor mu? Hayir
- Kullanici icerigi toplaniyor mu? Evet, kullanici reel/yorum yuklerse
- Analitik verisi toplaniyor mu? Evet, temel kullanim ve teknik loglar
