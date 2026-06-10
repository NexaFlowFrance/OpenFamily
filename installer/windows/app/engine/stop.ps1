# =============================================================================
#  OpenFamily — Arret des services (serveur Node + PostgreSQL)
#  Editee par NexaFlow — https://nexaflow.fr
# =============================================================================

. (Join-Path $PSScriptRoot 'common.ps1')

# --- 1. Arreter le serveur Node ----------------------------------------------
if (Test-Path $OFPidFile) {
    $pid = Get-Content $OFPidFile -ErrorAction SilentlyContinue
    if ($pid) {
        try {
            $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($p -and $p.Path -like '*node.exe') {
                Write-Host '[OpenFamily] Arret du serveur...'
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        } catch { }
    }
    Remove-Item $OFPidFile -Force -ErrorAction SilentlyContinue
}

# --- 2. Arreter PostgreSQL ---------------------------------------------------
$pgCtl = Join-Path $OFPgBin 'pg_ctl.exe'
if ((Test-Path (Join-Path $OFPgData 'PG_VERSION')) -and (Test-OFPgRunning)) {
    Write-Host '[OpenFamily] Arret de la base de donnees...'
    & $pgCtl -D "$OFPgData" -m fast -w stop
}

Write-Host '[OpenFamily] OpenFamily est arrete. Vos donnees sont conservees.'
exit 0
