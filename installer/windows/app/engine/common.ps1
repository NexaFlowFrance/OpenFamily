# =============================================================================
#  OpenFamily — Bibliotheque commune (chemins, environnement, reseau)
#  Editee par NexaFlow — https://nexaflow.fr
#  Ces scripts sont la plomberie interne de l'application : ils ne sont jamais
#  manipules directement par l'utilisateur final (tout passe par l'app graphique).
# =============================================================================

$ErrorActionPreference = 'Stop'

# Racine de l'installation = dossier parent de \engine
$Global:OFRoot     = Split-Path -Parent $PSScriptRoot
$Global:OFNode     = Join-Path $OFRoot 'runtime\node\node.exe'
$Global:OFPgBin    = Join-Path $OFRoot 'runtime\pgsql\bin'
$Global:OFServer   = Join-Path $OFRoot 'server\dist\index.js'
$Global:OFClient   = Join-Path $OFRoot 'client'
$Global:OFSchema   = Join-Path $OFRoot 'schema.sql'

# Donnees & logs : dans le profil utilisateur (ecriture sans droits admin)
$Global:OFData     = Join-Path $env:LOCALAPPDATA 'OpenFamily'
$Global:OFPgData   = Join-Path $OFData 'pgdata'
$Global:OFLogs     = Join-Path $OFData 'logs'
$Global:OFEnvFile  = Join-Path $OFData '.env'
$Global:OFPidFile  = Join-Path $OFData 'server.pid'

# Ports
$Global:OFAppPort  = 3000      # interface + API (expose sur le reseau local)
$Global:OFPgPort   = 5433      # PostgreSQL (uniquement en local, 127.0.0.1)

function Initialize-OFDirs {
    foreach ($d in @($OFData, $OFLogs)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    }
}

# --- Lecture / ecriture du fichier .env (cle=valeur) -------------------------
function Get-OFEnv {
    $map = @{}
    if (Test-Path $OFEnvFile) {
        foreach ($line in Get-Content $OFEnvFile) {
            if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
            $k, $v = $line -split '=', 2
            $map[$k.Trim()] = $v.Trim()
        }
    }
    return $map
}

function Set-OFEnvValue {
    param([string]$Key, [string]$Value)
    $lines = @()
    $found = $false
    if (Test-Path $OFEnvFile) { $lines = Get-Content $OFEnvFile }
    $out = foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=") { $found = $true; "$Key=$Value" }
        else { $line }
    }
    if (-not $found) { $out = @($out) + "$Key=$Value" }
    Set-Content -Path $OFEnvFile -Value $out -Encoding UTF8
}

# --- Detection de l'adresse IP locale (pour acces mobile) --------------------
function Get-OFLocalIP {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike '169.254.*' -and
                $_.IPAddress -ne '127.0.0.1' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Sort-Object -Property @{ Expression = { $_.InterfaceMetric } } |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($ip) { return $ip }
    } catch { }
    return '127.0.0.1'
}

# --- Etat des services -------------------------------------------------------
function Test-OFServerRunning {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$OFAppPort/health"
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# Verification rapide et NON bloquante de l'etat du serveur (pour l'interface).
# Un simple test de connexion TCP avec un court delai d'attente : ne gele jamais
# la fenetre, contrairement a une requete HTTP de 2 secondes.
function Test-OFServerPort {
    param([int]$TimeoutMs = 250)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $OFAppPort, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne($TimeoutMs, $false) -and $client.Connected) {
            $client.EndConnect($async)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-OFPgRunning {
    & (Join-Path $OFPgBin 'pg_isready.exe') -h 127.0.0.1 -p $OFPgPort *> $null
    return ($LASTEXITCODE -eq 0)
}

