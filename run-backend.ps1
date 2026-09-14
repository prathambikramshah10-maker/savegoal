$dir = "C:\Users\Pratham Bikram Shah\SaveGoal"
$log = Join-Path $dir "backend\server.out.log"
$err = Join-Path $dir "backend\server.err.log"

function Free-Port($port) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($l in $listeners) {
    try { Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
  }
}

while ($true) {
  Free-Port 5000
  Start-Sleep -Seconds 1
  Write-Host "[SaveGoal] Starting backend..."
  & node "$dir\backend\server.js" *>> "$log" 2>&1
  $code = $LASTEXITCODE
  Write-Host "[SaveGoal] Backend stopped (exit $code). Restarting in 3 seconds..."
  Start-Sleep -Seconds 3
}