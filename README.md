Kadrio, bir içerik akış ve reklam/monetizasyon platformu demosudur.

Dosyalar:
- index.html
- style.css
- app.js
- server.js
- package.json

Yerel geliştirme ve gerçek demo çalıştırma:
1. Bu klasörde terminal açın.
2. `npm install` komutunu çalıştırın.
3. `npm start` ile sunucuyu başlatın.
4. Tarayıcıda `http://localhost:3000` adresine gidin.

Production başlamadan önce güvenli bir admin token tanımlayın:

```powershell
$env:ADMIN_TOKEN = "uzun-ve-tahmin-edilemez-bir-deger"
npm start
```
- Kullanıcı şifreleri `crypto.scrypt` ile hashlenir.
- Silah, cinsel içerik ve şiddet içeren içerikler metadata filtresiyle reddedilir.
- Reel video adresleri yalnızca HTTPS olabilir.
- Görüntü tabanlı video moderasyonu için ayrıca bir harici moderasyon servisi bağlanmalıdır.
