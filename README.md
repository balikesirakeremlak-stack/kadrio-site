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

Production başlamadan önce güvenli admin ve session secret değerleri tanımlayın:

```powershell
$env:ADMIN_TOKEN = "uzun-ve-tahmin-edilemez-bir-deger"
$env:SESSION_SECRET = "farkli-uzun-ve-tahmin-edilemez-bir-deger"
$env:NODE_ENV = "production"
npm start
```
- `SESSION_SECRET`, `ADMIN_TOKEN` ile aynı değer olmamalıdır.
- Railway/Render üzerinde bu iki değer secret environment variable olarak tanımlanmalıdır.
- Kalıcı disk veya object storage bağlanmadan `database/` ve `uploads/` verileri yeniden deploy sırasında kaybolabilir.
- Kullanıcı şifreleri `crypto.scrypt` ile hashlenir.
- Silah, cinsel içerik ve şiddet içeren içerikler metadata filtresiyle reddedilir.
- Reel video adresleri yalnızca HTTPS olabilir.
- Görüntü tabanlı video moderasyonu için ayrıca bir harici moderasyon servisi bağlanmalıdır.
