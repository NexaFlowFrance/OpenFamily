#requires -Version 5.1
param(
    [string]$StopScript = (Join-Path $PSScriptRoot '..\app\engine\stop.ps1')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$temporaryRoot = Join-Path $PSScriptRoot ('.stop-test-' + [guid]::NewGuid().ToString('N'))
$windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$failed = 0

# Only the copied shutdown script runs. This fixture never loads the real common.ps1.
$fixtureCommon = @'
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    throw 'The shutdown regression must run in Windows PowerShell 5.1.'
}
$script:fixtureFolder = $PSScriptRoot
$script:scenarioName = Get-Content (Join-Path $PSScriptRoot 'scenario.txt')
$OFPidFile = Join-Path $PSScriptRoot 'server.pid'
$OFPgBin = Join-Path $PSScriptRoot 'no-postgres-binary'
$OFPgData = Join-Path $PSScriptRoot 'pgdata'
function Get-Process {
    [CmdletBinding()]
    param([int]$Id)
    Add-Content (Join-Path $script:fixtureFolder 'lookups.txt') $Id -Encoding Ascii
    if ($script:scenarioName -eq 'node') {
        return [pscustomobject]@{ Path = 'C:\OpenFamily-test\node.exe' }
    }
    if ($script:scenarioName -eq 'non-node') {
        return [pscustomobject]@{ Path = 'C:\OpenFamily-test\notepad.exe' }
    }
    return $null
}
function Stop-Process {
    [CmdletBinding()]
    param([int]$Id, [switch]$Force)
    Add-Content (Join-Path $script:fixtureFolder 'stops.txt') "$Id|$($Force.IsPresent)" -Encoding Ascii
}
function Test-OFPgRunning {
    Set-Content (Join-Path $script:fixtureFolder 'postgres-reached.txt') 'checked' -Encoding Ascii
    return $false # No PostgreSQL executable is supplied or invoked.
}
'@

try {
    New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
    foreach ($scenario in @('node', 'non-node', 'stale', 'absent')) {
        $caseDirectory = Join-Path $temporaryRoot $scenario
        New-Item -ItemType Directory -Path (Join-Path $caseDirectory 'pgdata') | Out-Null
        Copy-Item -LiteralPath $StopScript -Destination (Join-Path $caseDirectory 'stop.ps1')
        Set-Content (Join-Path $caseDirectory 'common.ps1') $fixtureCommon -Encoding UTF8
        Set-Content (Join-Path $caseDirectory 'scenario.txt') $scenario -Encoding Ascii
        Set-Content (Join-Path $caseDirectory 'pgdata\PG_VERSION') '16' -Encoding Ascii
        if ($scenario -ne 'absent') {
            Set-Content (Join-Path $caseDirectory 'server.pid') '424242' -Encoding Ascii
        }

        $copiedScript = Join-Path $caseDirectory 'stop.ps1'
        $stderr = Join-Path $caseDirectory 'stderr.txt'
        $child = Start-Process -FilePath $windowsPowerShell -WindowStyle Hidden -Wait -PassThru `
            -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$copiedScript`"") `
            -RedirectStandardOutput (Join-Path $caseDirectory 'stdout.txt') -RedirectStandardError $stderr

        $problems = @()
        if ($child.ExitCode -ne 0) { $problems += "exit code $($child.ExitCode)" }
        $expectedLookup = if ($scenario -eq 'absent') { '' } else { '424242' }
        $lookups = if (Test-Path (Join-Path $caseDirectory 'lookups.txt')) {
            @(Get-Content (Join-Path $caseDirectory 'lookups.txt')) -join ','
        } else { '' }
        if ($lookups -ne $expectedLookup) { $problems += 'unexpected process lookup' }
        $expectedStop = if ($scenario -eq 'node') { '424242|True' } else { '' }
        $stops = if (Test-Path (Join-Path $caseDirectory 'stops.txt')) {
            @(Get-Content (Join-Path $caseDirectory 'stops.txt')) -join ','
        } else { '' }
        if ($stops -ne $expectedStop) { $problems += 'unexpected process stop' }
        if (Test-Path (Join-Path $caseDirectory 'server.pid')) { $problems += 'PID file not removed' }
        if (-not (Test-Path (Join-Path $caseDirectory 'postgres-reached.txt'))) {
            $problems += 'PostgreSQL check not reached'
        }
        if ((Get-Content $stderr -Raw) -match 'VariableNotWritable') {
            $problems += 'VariableNotWritable'
        }
        if ($problems.Count -gt 0) {
            $failed++
            Write-Host ("FAIL {0}: {1}" -f $scenario, ($problems -join '; '))
        } else {
            Write-Host "PASS $scenario"
        }
    }
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).Path
        $repositoryPrefix = $repositoryRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $testsPrefix = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        if (-not $resolvedTemporaryRoot.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not $resolvedTemporaryRoot.StartsWith($testsPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to remove a test directory outside the repository tests folder.'
        }
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
    }
}

if ($failed -gt 0) {
    Write-Host "$failed of 4 shutdown scenarios failed."
    exit 1
}
Write-Host 'All 4 shutdown scenarios passed in Windows PowerShell 5.1.'
