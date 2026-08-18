# create_and_push_github.ps1
# Otomatik: GitHub CLI varsa kullanır, yoksa winget ile kurmaya çalışır.
# Çalıştırma: PowerShell'de: `powershell -ExecutionPolicy Bypass -File .\scripts\create_and_push_github.ps1`

param(
  [string]$RepoName = "reeloram-site",
  [string]$Visibility = "public"
)

function Ensure-GH {
  Write-Host "Checking for gh (GitHub CLI)..."
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    Write-Host "gh bulunamadı. Winget ile kurulmaya çalışılıyor..."
    try {
      winget install --id GitHub.cli -e --silent
    } catch {
      Write-Host "winget ile kurulum başarısız. Lütfen manuel olarak 'gh' kurup 'gh auth login' çalıştırın."
      exit 1
    }
  }
}

function Ensure-Auth {
  Write-Host "GitHub oturum durumu kontrol ediliyor..."
  $status = & gh auth status 2>&1
  if ($LASTEXITCODE -ne 0 -or $status -match "not authenticated") {
    Write-Host "GitHub CLI ile oturum açmalısınız. Tarayıcı yönlendirmesi olacak."
    & gh auth login
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Oturum açma başarısız. Lütfen 'gh auth login' komutunu manuel çalıştırıp tekrar deneyin."
      exit 1
    }
  } else {
    Write-Host "Zaten oturum açık."
  }
}

function Create-And-Push {
  Write-Host "Repo oluşturuluyor ve push ediliyor: $RepoName"
  try {
    & gh repo create $RepoName --$Visibility --source=. --remote=origin --push --confirm
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Repo başarıyla oluşturuldu ve kod push edildi."
    } else {
      Write-Host "Repo oluşturma veya push sırasında hata. Git remote kontrol ediliyor..."
      & git remote add origin "https://github.com/$(gh api user --jq .login)/$RepoName.git" 2>$null
      git branch -M main
      git push -u origin main
    }
  } catch {
    Write-Host "Otomatik işlem başarısız: $_"
    exit 1
  }
}

# Main
Ensure-GH
Ensure-Auth
Create-And-Push

Write-Host "Bitti. Lütfen sonucu bana bildirin (ör. 'bitti')."