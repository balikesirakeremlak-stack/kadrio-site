Aşağıda hızlıca konteyner oluşturup çalıştırma ve Docker Hub'a push etme adımları var.

1) Lokal olarak image oluştur ve çalıştır
```bash
docker build -t reeloram-site:latest .
docker run -d -p 3000:3000 --name reeloram-site reeloram-site:latest
```

2) Docker Hub'a push (hesabınız varsa)
```bash
docker tag reeloram-site:latest YOUR_DOCKERHUB_USER/reeloram-site:latest
docker push YOUR_DOCKERHUB_USER/reeloram-site:latest
```

3) Sunucuya deploy (örnek: Ubuntu VPS)
- Sunucuya Docker kurun.
- `docker pull YOUR_DOCKERHUB_USER/reeloram-site:latest` ve `docker run -d -p 80:3000` ile çalıştırın.

Notlar:
- Uygulama varsayılan olarak `PORT=3000` dinler. Farklı bir port kullanmak isterseniz `-e PORT=...` ekleyin.
- Localtunnel geçiciydi; bu Docker yöntemi kalıcı host üzerinde çalıştırıldığında dışarıdan erişim kalıcı olur.

CI/CD (GitHub Actions):
- Repo'ya `main` branch'e push yapıldığında `.github/workflows/ci-cd.yml` çalışır, Docker image'ı `ghcr.io/${{ github.repository_owner }}/reeloram-site:latest` olarak build edip push eder.
- Railway ile otomatik deploy için repo secrets içine `RAILWAY_TOKEN` ekleyin; workflow bu secret bulunduğunda `railway up` ile deploy deneyecektir.
