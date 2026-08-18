# Start PM2 process and localtunnel for Reeloram
Set-Location -Path "C:\Users\Tunca\ZİVR0"

# Start PM2 process if not running
Write-Output "Starting PM2 process reeloram-3001..."
npx.cmd pm2 start server-runner.js --name reeloram-3001 || npx.cmd pm2 restart reeloram-3001 --update-env

# Start localtunnel for port 3001
Write-Output "Starting localtunnel..."
Start-Process -FilePath "npx.cmd" -ArgumentList "localtunnel --port 3001" -WindowStyle Hidden

Write-Output "Start script finished."
