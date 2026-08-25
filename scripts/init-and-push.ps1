param(
  [string]$RepoUrl = ''
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git yüklü değil. Lütfen https://git-scm.com/downloads adresinden Git'i yükleyin."
  exit 1
}

if (-not $RepoUrl) {
  Write-Host "Kullanım: .\init-and-push.ps1 -RepoUrl 'https://github.com/kullanici/repo.git'"
  exit 1
}

Write-Host "Başlatılıyor: git init, commit ve push (main)"

git init
git add .
git commit -m "Initial Kadrio site"
git branch -M main
if ((git remote) -contains 'origin') {
  Write-Host 'origin remote zaten tanımlı; push ediliyor.'
} else {
  git remote add origin $RepoUrl
}

git push -u origin main
