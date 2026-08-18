Hızlı Monetizasyon Rehberi

Bu proje için hızlıca gelir akışı başlatmak üzere öneriler ve adımlar:

1) Reklam Ağları (Google AdSense)
- Gereksinimler: özel domain, HTTPS, açık içerik politikası ve gizlilik sayfası.
- AdSense başvurusu onaylandıktan sonra sayfaya verilen script'i ekleyin.
- Bu repo içinde `index.html`'de ad yer tutucular eklendi (data-ad-client ile değiştirin).

2) Affiliate Linkler
- `server.js` içinde `/affiliate/redirect?aid=KEY` endpoint'i bulunuyor.
- `affiliateMap` içine anahtar ve hedef URL ekleyin.
- Affiliate tıklamalar `affiliateClicks` içinde kaydedilir; admin için `/admin/affiliate-stats` var.
- Affiliate sağlayıcısından aldığınız referans parametrelerini `affiliateMap`'e ekleyin.

3) Sponsor Paketleri / Doğrudan Satış
- `package-form` ile kullanıcılardan teklif toplayabilirsiniz; `/api/package-request` endpoint'i mevcut.
- Sponsor teklif sürecini otomatikleştirmek için bir CRM/Google Sheets entegrasyonu ekleyebilirsiniz.

4) Ödemeler (Stripe)
- Stripe ile abonelik/checkout eklemek için `STRIPE_SECRET_KEY` gereklidir.
- Örnek: sunucuya `stripe` paketini ekleyip bir `/create-checkout-session` endpoint'i oluşturun.
- Güvenli saklama: çevresel değişkenlerde API anahtarlarını tutun.

5) Analiz ve Performans
- `/admin/analytics` ile isteklerin kısa kaydını görebilirsiniz.
- Daha gelişmiş takip için Google Analytics / Plausible ekleyin.

6) Canlıya Taşıma
- Kalıcı yayın önerisi: Docker image oluşturup bir VPS ya da Railway / Vercel / Render üzerinde çalıştırın.
- `Dockerfile` ve `README_DEPLOY.md` repoda mevcut.

Gerekirse ben:
- AdSense yerlerine gerçek script'i ekleyebilirim (sizin AdSense client ID ile),
- Stripe checkout endpoint'i ekleyip test işlemleri yapabilirim (siz API anahtarını sağlarsınız),
- GitHub/Deployment için otomatik adımları tamamlayabilirim.

Hangi adımı hemen başlatmamı istersiniz? (AdSense / Affiliate genişlet / Stripe / Deploy)