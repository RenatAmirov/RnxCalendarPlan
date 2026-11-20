param(
    [switch]$InfrastructureOnly,
    [switch]$Background,
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [string]$RedisBin = 'C:\Program Files\Redis'
)
$ErrorActionPreference = 'Stop'
if ($InfrastructureOnly -and $Background) { throw 'Choose either -InfrastructureOnly or -Background.' }
. (Join-Path $PSScriptRoot 'Local-Process.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
$pgData = Join-Path $localRoot 'postgres'
$redisData = Join-Path $localRoot 'redis'
New-Item -ItemType Directory -Force -Path $localRoot,$redisData | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $PostgresBin 'initdb.exe'))) { throw 'PostgreSQL not found. Set -PostgresBin or use docker compose up --build.' }
if (!(Test-Path -LiteralPath (Join-Path $RedisBin 'redis-server.exe'))) { throw 'Redis not found. Set -RedisBin or use docker compose up --build.' }
if (!(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
    $passwordFile = Join-Path $localRoot 'init-password.txt'
    [IO.File]::WriteAllText($passwordFile, 'rnx_local_dev')
    try {
        & (Join-Path $PostgresBin 'initdb.exe') -D $pgData -U rnx --auth=scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
    } finally { Remove-Item -LiteralPath $passwordFile -Force }
}
& (Join-Path $PostgresBin 'pg_ctl.exe') -D $pgData status *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-NetTCPConnection -LocalPort 15432 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 15432 is occupied. No existing service was changed.' }
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $pgData -l (Join-Path $localRoot 'postgres.log') -o '-p 15432 -h 127.0.0.1' -w start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
}
$redisPidFile = Join-Path $redisData 'server.pid'
$ownedRedis = $false
if (Test-Path -LiteralPath $redisPidFile) {
    $ownedRedis = Test-LocalRedisProcess -ProcessId ([int](Get-Content -LiteralPath $redisPidFile)) -ConfigPath (Join-Path $redisData 'redis.conf')
}
if (!$ownedRedis) {
    if (Get-NetTCPConnection -LocalPort 16379 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 16379 is occupied. No existing service was changed.' }
    $redisConfig = Join-Path $redisData 'redis.conf'
    $redisDir = $redisData.Replace('\', '/')
    @"
bind 127.0.0.1
port 16379
dir "$redisDir"
save ""
appendonly no
logfile "$redisDir/server.log"
"@ | Set-Content -LiteralPath $redisConfig -Encoding ascii
    $redisProcess = Start-Process -FilePath (Join-Path $RedisBin 'redis-server.exe') -ArgumentList ('"' + $redisConfig + '"') -WorkingDirectory $redisData -WindowStyle Hidden -PassThru
    $redisProcess.Id | Set-Content -LiteralPath $redisPidFile
    Start-Sleep -Milliseconds 600
    if ($redisProcess.HasExited) { throw 'Redis startup failed; see .local/redis/server.log.' }
}
Write-Host 'Local PostgreSQL: 127.0.0.1:15432; Redis: 127.0.0.1:16379'
if (!$InfrastructureOnly) {
    $webRecord = Join-Path $localRoot 'web-process.json'
    $webDll = Join-Path $localRoot 'app/RnxCalendarPlan.Web.dll'
    $existingWeb = Get-LocalWebProcess -RecordPath $webRecord -ExpectedDll $webDll
    if ($existingWeb) {
        Write-Host 'The project is already running: http://127.0.0.1:5080'
        return
    }
    if (Get-NetTCPConnection -LocalPort 5080 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5080 is occupied. No existing process was changed.' }
    Push-Location $projectRoot
    try {
        if (!$Background) {
            dotnet run --project src/RnxCalendarPlan.Web
            if ($LASTEXITCODE -ne 0) { throw 'Application startup failed.' }
            return
        }
        dotnet publish src/RnxCalendarPlan.Web -c Release -o (Join-Path $localRoot 'app')
        if ($LASTEXITCODE -ne 0) { throw 'Application publish failed.' }
        $dotnetPath = (Get-Command dotnet -CommandType Application).Source
        $webProcess = Start-Process -FilePath $dotnetPath -ArgumentList ('"' + $webDll + '" --urls http://127.0.0.1:5080') -WorkingDirectory (Join-Path $localRoot 'app') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'web.stdout.log') -RedirectStandardError (Join-Path $localRoot 'web.stderr.log')
        @{ processId = $webProcess.Id; startTicks = $webProcess.StartTime.ToUniversalTime().Ticks; dll = $webDll } | ConvertTo-Json | Set-Content -LiteralPath $webRecord
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($webProcess.HasExited) { throw 'Application exited. See .local/web.stderr.log and .local/app/logs.' }
            try {
                $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5080/health' -TimeoutSec 2
                if ($health.database) {
                    Write-Host ('Ready: http://127.0.0.1:5080 (' + $health.status + '). Stop with .\scripts\Stop-Local.ps1')
                    return
                }
            } catch { }
            Start-Sleep -Milliseconds 500
        }
        Stop-Process -InputObject $webProcess -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $webRecord -ErrorAction SilentlyContinue
        throw 'Application did not become ready in 45 seconds. See .local/web.stderr.log.'
    } finally { Pop-Location }
}
