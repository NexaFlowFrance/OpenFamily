# =============================================================================
#  OpenFamily — Demarrage des services (PostgreSQL embarque + serveur Node)
#  Editee par NexaFlow — https://nexaflow.fr
# =============================================================================

. (Join-Path $PSScriptRoot 'common.ps1')
Initialize-OFDirs

$pgCtl   = Join-Path $OFPgBin 'pg_ctl.exe'
$initdb  = Join-Path $OFPgBin 'initdb.exe'
$psql    = Join-Path $OFPgBin 'psql.exe'
$pgLog   = Join-Path $OFLogs 'postgres.log'
$srvLog  = Join-Path $OFLogs 'server.log'

# --- 1. Premiere execution : generer .env + base de donnees ------------------
function New-OFSecret([int]$Bytes) {
    $b = New-Object 'System.Byte[]' $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return -join ($b | ForEach-Object { $_.ToString('x2') })
}

if (-not (Test-Path $OFEnvFile)) {
    Write-Host '[OpenFamily] Premiere configuration : generation des secrets...'
    $jwt = New-OFSecret 48
    $dbPwd = New-OFSecret 16
    @(
        '# Configuration OpenFamily generee automatiquement (NexaFlow)',
        '# Ne partagez pas ce fichier : il contient vos secrets locaux.',
        "POSTGRES_HOST=127.0.0.1",
        "POSTGRES_PORT=$OFPgPort",
        "POSTGRES_DB=openfamily",
        "POSTGRES_USER=openfamily",
        "POSTGRES_PASSWORD=$dbPwd",
        "SERVER_PORT=$OFAppPort",
        "NODE_ENV=production",
        "JWT_SECRET=$jwt",
        "CORS_ORIGINS=*",
        "VAPID_SUBJECT=mailto:contact@nexaflow.fr",
        "VAPID_PUBLIC_KEY=",
        "VAPID_PRIVATE_KEY="
    ) | Set-Content -Path $OFEnvFile -Encoding UTF8
}

$env_map = Get-OFEnv

# --- 2. Initialiser le cluster PostgreSQL si absent --------------------------
if (-not (Test-Path (Join-Path $OFPgData 'PG_VERSION'))) {
    Write-Host '[OpenFamily] Initialisation de la base de donnees (premiere fois)...'
    $pwFile = Join-Path $env:TEMP 'of_pgpw.txt'
    Set-Content -Path $pwFile -Value $env_map['POSTGRES_PASSWORD'] -NoNewline -Encoding Ascii
    & $initdb --pgdata="$OFPgData" --username="$($env_map['POSTGRES_USER'])" `
        --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 `
        --pwfile="$pwFile" *>> $pgLog
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue

    # N'ecouter que sur la boucle locale : PostgreSQL n'est jamais expose au reseau.
    $conf = Join-Path $OFPgData 'postgresql.conf'
    Add-Content -Path $conf -Value "`nlisten_addresses = '127.0.0.1'`nport = $OFPgPort"
}

# --- 3. Demarrer PostgreSQL --------------------------------------------------
if (-not (Test-OFPgRunning)) {
    Write-Host '[OpenFamily] Demarrage de la base de donnees...'
    & $pgCtl -D "$OFPgData" -l "$pgLog" -o "-p $OFPgPort" -w start
}

# --- 4. Creer la base au premier lancement (le serveur cree son propre schema) -
$env:PGPASSWORD = $env_map['POSTGRES_PASSWORD']
$dbName = $env_map['POSTGRES_DB']
$dbUser = $env_map['POSTGRES_USER']
$exists = & $psql -h 127.0.0.1 -p $OFPgPort -U $dbUser -d postgres -tAc `
    "SELECT 1 FROM pg_database WHERE datname='$dbName'"
if ($exists -ne '1') {
    Write-Host '[OpenFamily] Creation de la base de donnees...'
    & $psql -h 127.0.0.1 -p $OFPgPort -U $dbUser -d postgres -c "CREATE DATABASE $dbName"
}
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# --- 5. Demarrer le serveur Node (interface + API + WebSocket) ---------------
if (Test-OFServerRunning) {
    Write-Host '[OpenFamily] Le serveur est deja demarre.'
    exit 0
}

Write-Host '[OpenFamily] Demarrage du serveur OpenFamily...'

# Variables d'environnement pour le processus Node
foreach ($k in $env_map.Keys) { Set-Item -Path "Env:\$k" -Value $env_map[$k] }
$env:SERVE_CLIENT_DIR = $OFClient

$proc = Start-Process -FilePath $OFNode -ArgumentList "`"$OFServer`"" `
    -WorkingDirectory (Join-Path $OFRoot 'server') `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $srvLog -RedirectStandardError (Join-Path $OFLogs 'server.err.log')
Set-Content -Path $OFPidFile -Value $proc.Id -Encoding Ascii

# --- 6. Attendre que l'interface reponde -------------------------------------
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-OFServerRunning) {
        Write-Host "[OpenFamily] Pret sur http://localhost:$OFAppPort"
        exit 0
    }
}
Write-Warning '[OpenFamily] Le serveur met du temps a repondre — consultez les logs.'
exit 1
