Reeloram - Deploy Talimatları

1) Yerel test (basit):
- Tarayıcıda `index.html` dosyasını açın.

2) Hızlı yerel sunucu (Python yüklüyse):
```powershell
cd "C:\Users\Tunca\ZİVR0"
python -m http.server 8000
# ardından http://localhost:8000 açın
```

3) Yerel Node.js backend ile test etmek:
- Node.js yüklü değilse: https://nodejs.org/ adresinden LTS sürümünü yükleyin.
- Bu klasörde terminal açın ve aşağıdaki komutları çalıştırın:
```powershell
cd "C:\Users\Tunca\ZİVR0"
npm install
npm start
```
- Ardından tarayıcıda `http://localhost:3000` adresini açın.

4) GitHub üzerine yüklemek (önerilen):
- Git yüklü değilse: https://git-scm.com/downloads
- GitHub üzerinde yeni bir repository oluşturun (ör: `reeloram-site`)
- Aşağıdaki PowerShell scriptini çalıştırın (repo URL'nizi verin):
```powershell
cd "C:\Users\Tunca\ZİVR0"
./scripts/init-and-push.ps1 -RepoUrl "https://github.com/<kullanici>/<repo>.git"
```
- Sonra GitHub tarafında `Settings → Pages` bölümünden `Branch: main / root` seçip etkinleştirin.

5) Netlify (alternatif hızlı deploy):
- https://app.netlify.com/ adresinden yeni site oluşturun ve repo'yu bağlayın veya `Drag & Drop` ile proje klasörünü yükleyin.
- Not: `reeloram-deploy.zip` arşivini doğrudan Netlify'a sürükleyip bırakabilirsiniz.

6) Vercel (alternatif):
- https://vercel.com/ ile GitHub hesabınızı bağlayın ve repo'yu deploy edin.

API uç noktaları:
- `GET /api/reels` — akış verisini getirir.
- `POST /api/track` — etkinlikleri izleme verisi olarak kaydeder.
- `POST /api/creator` — üretici başvurularını kaydeder.
- `POST /api/package-request` — reklam paket talebini kaydeder.
- `GET /api/status` — backend durumunu gösterir.

Notlar:
- `scripts/init-and-push.ps1` scripti Git yüklü olmasını gerektirir.
- `.github/workflows/pages.yml` dosyası, `main` branch'e her push'ta GitHub Actions ile otomatik deploy yapacak.
- `index.html`, `style.css` ve `app.js` aynı klasörde kalmalı.
