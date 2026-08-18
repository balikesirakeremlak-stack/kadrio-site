Hızlı GitHub push ve Railway deploy adımları

1) GitHub'a push (yerel repo hazır)
- Eğer yeni bir GitHub repo oluşturacaksanız, yerel dizinde şu komutları çalıştırın ve GitHub remote ekleyin:

```bash
# Örnek: GitHub'da boş repo oluşturduktan sonra
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main
```

- Eğer `gh` (GitHub CLI) yüklüyse hızlıca:

```bash
gh repo create YOUR_USERNAME/REPO --public --source=. --remote=origin --push
```

2) Railway ile deploy (GitHub bağlantılı)
- Railway'e giriş yapın ve yeni proje oluşturun.
- "Deploy from GitHub" seçeneği ile repository'nizi bağlayın.
- Environment variables olarak ekleyin:
  - `ADMIN_TOKEN` (mevcut admin token)
  - `PORT` = `3000` (veya Railway otomatik port)
  - Diğer gerekli anahtarlar (STRIPE_SECRET_KEY vs.)
- Deploy başlatın.

3) Direkt Docker image yükleme (VPS/Server)
- Docker varsa:

```bash
docker build -t reeloram-site:local .
docker run -d -p 3000:3000 --name reeloram-site reeloram-site:local
```

4) Ben size push ve deploy yapabilirim.
- İzin verirseniz `git remote add` ve `git push` adımlarını ben yerine getirebilirim; bunun için ya boş GitHub repo URL'si verin ya da bir GitHub Personal Access Token sağlayın (veya `gh` CLI ile bağlantı izni verin). Railway içinse sizden bir API token veya GitHub bağlantı izni gerekir.

Güvenlik notu: Token/şifre gibi hassas bilgileri burada paylaşmayın; isterseniz terminale kendiniz girer ve bana izin verirsiniz ya da ben adımları gösteririm.
