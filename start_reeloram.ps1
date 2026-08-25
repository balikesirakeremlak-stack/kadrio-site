# Start Kadrio with PM2 and an optional localtunnel
Set-Location -Path $PSScriptRoot

# Install dependencies and prepare runtime folders
Write-Output "Installing dependencies..."
& "C:\Program Files\nodejs\npm.cmd" install
New-Item -ItemType Directory -Force -Path ".\database", ".\uploads" | Out-Null

$env:PORT = "3000"
$env:NODE_ENV = "development"
if (-not $env:ADMIN_TOKEN) { $env:ADMIN_TOKEN = "local-kadrio-admin-token" }

# Replace any stale Kadrio process with the current server
Write-Output "Starting PM2 process kadrio..."
npx.cmd pm2 delete kadrio 2>$null
npx.cmd pm2 start server.js --name kadrio --update-env

# Start a temporary public URL for sharing the local demo
Write-Output "Starting public tunnel..."
Remove-Item ".\kadrio-tunnel.log" -ErrorAction SilentlyContinue
Remove-Item ".\kadrio-tunnel-error.log" -ErrorAction SilentlyContinue
Start-Process -FilePath "npx.cmd" -ArgumentList "localtunnel --port 3000" -RedirectStandardOutput ".\kadrio-tunnel.log" -RedirectStandardError ".\kadrio-tunnel-error.log" -WindowStyle Hidden

Write-Output "Kadrio is running at http://localhost:3000"
Write-Output "Public tunnel URL will be written to kadrio-tunnel.log"
