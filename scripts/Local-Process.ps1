function Get-LocalWebProcess {
    param([string]$RecordPath, [string]$ExpectedDll)
    if (!(Test-Path -LiteralPath $RecordPath)) { return $null }
    try {
        $record = Get-Content -LiteralPath $RecordPath -Raw | ConvertFrom-Json
        if ($record.dll -ne $ExpectedDll) { return $null }
        $webProcess = Get-Process -Id ([int]$record.processId) -ErrorAction Stop
        if ($webProcess.ProcessName -ne 'dotnet' -or
            $webProcess.StartTime.ToUniversalTime().Ticks -ne [long]$record.startTicks) { return $null }
        $details = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $webProcess.Id)
        if (!$details.CommandLine.Contains($ExpectedDll, [StringComparison]::OrdinalIgnoreCase)) { return $null }
        return $webProcess
    } catch { return $null }
}

function Test-LocalRedisProcess {
    param([int]$ProcessId, [string]$ConfigPath)
    $redisProcess = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (!$redisProcess -or $redisProcess.ProcessName -ne 'redis-server') { return $false }
    $details = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $ProcessId)
    return $details.CommandLine -and $details.CommandLine.Contains($ConfigPath, [StringComparison]::OrdinalIgnoreCase)
}
