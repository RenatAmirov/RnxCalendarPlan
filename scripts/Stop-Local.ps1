param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Local-Process.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
$webRecord = Join-Path $localRoot 'web-process.json'
$webDll = Join-Path $localRoot 'app/RnxCalendarPlan.Web.dll'
$webProcess = Get-LocalWebProcess -RecordPath $webRecord -ExpectedDll $webDll
if ($webProcess) { Stop-Process -InputObject $webProcess }
if (Test-Path -LiteralPath $webRecord) { Remove-Item -LiteralPath $webRecord }
$pgData = Join-Path $localRoot 'postgres'
if (Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION')) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $pgData status *> $null
    if ($LASTEXITCODE -eq 0) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') -D $pgData -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the project PostgreSQL cluster.' }
    }
}
$redisPidFile = Join-Path $localRoot 'redis/server.pid'
if (Test-Path -LiteralPath $redisPidFile) {
    $redisProcessId = [int](Get-Content -LiteralPath $redisPidFile)
    if (Test-LocalRedisProcess -ProcessId $redisProcessId -ConfigPath (Join-Path $localRoot 'redis/redis.conf')) {
        Stop-Process -Id $redisProcessId
    }
    Remove-Item -LiteralPath $redisPidFile
}
Write-Host 'The project background app and infrastructure are stopped. Data in .local is preserved.'
