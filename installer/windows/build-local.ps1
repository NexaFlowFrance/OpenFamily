# =============================================================================
#  OpenFamily — Build & test local de l'installeur Windows (.exe)
#  Edite par NexaFlow — https://nexaflow.fr
#
#  A LANCER DANS LA VM WINDOWS (depuis le dossier partage OpenFamily).
#
#  Ce script reproduit la CI GitHub en local :
#    1. Installe les outils manquants (Node.js, Inno Setup, ImageMagick) via winget/choco
#    2. Compile shared + serveur + client (mode same-origin)
#    3. Telecharge les runtimes portables Node.js et PostgreSQL
#    4. Genere l'icone / les visuels depuis le logo OpenFamily
#    5. Compile OpenFamily-Setup.exe avec Inno Setup
#    6. Propose de lancer l'installeur pour le tester
#
#  Utilisation (PowerShell en tant qu'Administrateur, recommande) :
#    Set-ExecutionPolicy -Scope Process Bypass -Force
#    .\build-local.ps1
#
#  Options :
#    -Version 1.1.0     Numero de version a graver dans l'installeur
#    -SkipDeps          Ne pas (re)installer Node/Inno/ImageMagick
#    -Run               Lancer l'installeur automatiquement a la fin
#    -WorkDir C:\OFbuild Copier le repo ici avant build (recommande si le
#                        dossier partage UTM est lent ou pose des soucis npm)
# =============================================================================

[CmdletBinding()]
param(
    [string]$Version = "1.1.0",
    [switch]$SkipDeps,
    [switch]$Run,
    [switch]$NoPrompt,
    [string]$WorkDir
)

$ErrorActionPreference = 'Stop'
$NODE_VERSION = "20.18.0"
$PG_VERSION   = "16.4-1"

function Info($m)  { Write-Host "[OpenFamily] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[OpenFamily] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[OpenFamily] $m" -ForegroundColor Yellow }
function Fail($m)  { Write-Host "[OpenFamily] $m" -ForegroundColor Red; exit 1 }

# --- Localiser le repo (ce script est dans installer\windows) ----------------
$ScriptDir   = $PSScriptRoot
$InstallerWin = $ScriptDir
$RepoRoot    = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Info "Depot detecte : $RepoRoot"

# --- Option : copier le repo dans un dossier local (perfs / npm symlinks) ----
if ($WorkDir) {
    Info "Copie du depot vers $WorkDir (cela peut prendre une minute)..."
    if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    # On exclut les node_modules et builds existants pour repartir propre
    robocopy $RepoRoot $WorkDir /E /XD node_modules dist .git /NFL /NDL /NJH /NJS /NP | Out-Null
    $RepoRoot     = $WorkDir
    $InstallerWin = Join-Path $WorkDir 'installer\windows'
    Ok "Copie terminee."
}

$AppDir    = Join-Path $InstallerWin 'app'
$AssetsDir = Join-Path $InstallerWin 'assets'
$DistDir   = Join-Path $RepoRoot 'dist\windows'

# --- Verifier l'architecture -------------------------------------------------
if (-not [Environment]::Is64BitOperatingSystem) {
    Fail "Cet installeur cible Windows 64 bits. La VM doit etre en x64."
}

# =============================================================================
#  1. Outils requis
# =============================================================================
function Test-Cmd($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Install-Tooling {
    $hasWinget = Test-Cmd winget
    $hasChoco  = Test-Cmd choco

    if (-not $hasWinget -and -not $hasChoco) {
        Info "Installation de Chocolatey (gestionnaire de paquets)..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        $env:Path += ";$env:ProgramData\chocolatey\bin"
        $hasChoco = $true
    }

    function Ensure($cmd, $wingetId, $chocoId) {
        if (Test-Cmd $cmd) { Ok "$cmd deja present."; return }
        Info "Installation de $cmd..."
        if ($hasWinget) {
            winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements -e | Out-Null
        } else {
            choco install $chocoId -y --no-progress | Out-Null
        }
    }

    Ensure 'node'   'OpenJS.NodeJS.LTS'      'nodejs-lts'
    Ensure 'magick' 'ImageMagick.ImageMagick' 'imagemagick.app'

    # Inno Setup : pas de commande dans le PATH, on verifie le fichier
    if (-not (Get-InnoSetupPath)) {
        Info "Installation de Inno Setup..."
        if ($hasWinget) {
            winget install --id JRSoftware.InnoSetup --silent --accept-source-agreements --accept-package-agreements -e | Out-Null
        } else {
            choco install innosetup -y --no-progress | Out-Null
        }
    }

    # Rafraichir le PATH pour la session courante
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path','User')
}

function Get-InnoSetupPath {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LocalAppData\Programs\Inno Setup 6\ISCC.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    # Fallback : chercher dans le PATH
    $fromPath = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }
    return $null
}

if (-not $SkipDeps) {
    Install-Tooling
} else {
    Warn "Etape outils ignoree (-SkipDeps)."
}

if (-not (Test-Cmd node))   { Fail "Node.js introuvable. Relancez sans -SkipDeps." }
if (-not (Test-Cmd magick)) { Warn "ImageMagick introuvable : visuels par defaut limites." }
$ISCC = Get-InnoSetupPath
if (-not $ISCC) { Fail "Inno Setup (ISCC.exe) introuvable. Relancez sans -SkipDeps." }
Ok "Outils prets. ISCC : $ISCC"

# =============================================================================
#  2. Compiler l'application (shared + serveur + client same-origin)
# =============================================================================
function Invoke-In($dir, [scriptblock]$block) {
    Push-Location $dir
    try { & $block } finally { Pop-Location }
}

Info "Compilation de shared..."
Invoke-In (Join-Path $RepoRoot 'shared') {
    npm install --legacy-peer-deps --no-audit --no-fund
    npm run build
}

Info "Compilation du serveur..."
Invoke-In (Join-Path $RepoRoot 'server') {
    npm install --legacy-peer-deps --no-audit --no-fund
    npm run build
}

Info "Compilation du client (mode same-origin pour acces reseau local)..."
Invoke-In (Join-Path $RepoRoot 'client') {
    # Pas besoin de definir VITE_API_URL / VITE_WS_URL : en build de production,
    # le client utilise automatiquement la meme origine (cf. client/src/lib/api.ts).
    # On s'assure au contraire que d'eventuelles valeurs heritees ne polluent pas
    # le build (sinon l'app pointerait vers une mauvaise adresse).
    Remove-Item Env:\VITE_API_URL, Env:\VITE_WS_URL -ErrorAction SilentlyContinue
    npm install --legacy-peer-deps --no-audit --no-fund
    npm run build
}
Ok "Application compilee."

# =============================================================================
#  3. Preparer l'arborescence de l'installeur (app\server, app\client...)
# =============================================================================
Info "Preparation des fichiers de l'application..."
# On nettoie uniquement server et client. Le dossier runtime (Node + PostgreSQL)
# est CONSERVE entre les builds : il est volumineux et ne change jamais, donc on
# evite de le re-extraire / re-copier a chaque compilation.
foreach ($d in @("$AppDir\server", "$AppDir\client")) {
    if (Test-Path $d) { Remove-Item $d -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}
New-Item -ItemType Directory -Force -Path "$AppDir\runtime" | Out-Null

# Serveur : code compile + dependances de prod
Copy-Item (Join-Path $RepoRoot 'server\dist') "$AppDir\server\dist" -Recurse -Force
Copy-Item (Join-Path $RepoRoot 'server\package.json') "$AppDir\server\package.json" -Force
Invoke-In "$AppDir\server" {
    npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
}

# Client : build statique
Copy-Item (Join-Path $RepoRoot 'client\dist\*') "$AppDir\client" -Recurse -Force

Ok "Fichiers application prets."

# =============================================================================
#  4. Embarquer Node.js et PostgreSQL portables
# =============================================================================
# Cache PERSISTANT (hors %TEMP%, qui peut etre purge) : les archives telechargees
# sont conservees durablement, donc Node et PostgreSQL ne sont telecharges qu'UNE
# SEULE FOIS, meme apres un redemarrage ou un nettoyage de disque.
$cache = Join-Path $env:LOCALAPPDATA 'OpenFamily-build-cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null

# --- Node.js ---
$nodeDest = "$AppDir\runtime\node"
if (-not (Test-Path "$nodeDest\node.exe")) {
    Info "Telechargement de Node.js $NODE_VERSION..."
    $nodeZip = Join-Path $cache "node-$NODE_VERSION.zip"
    if (-not (Test-Path $nodeZip)) {
        Invoke-WebRequest "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip" -OutFile $nodeZip
    }
    $tmp = Join-Path $cache 'node_tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $nodeZip -DestinationPath $tmp -Force
    $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
    New-Item -ItemType Directory -Force -Path $nodeDest | Out-Null
    Copy-Item "$src\*" $nodeDest -Recurse -Force
}
Ok "Node.js embarque."

# --- PostgreSQL ---
$pgDest = "$AppDir\runtime\pgsql"
if (-not (Test-Path "$pgDest\bin\pg_ctl.exe")) {
    Info "Telechargement de PostgreSQL $PG_VERSION (~ 300 Mo)..."
    $pgZip = Join-Path $cache "pgsql-$PG_VERSION.zip"
    if (-not (Test-Path $pgZip)) {
        Invoke-WebRequest "https://get.enterprisedb.com/postgresql/postgresql-$PG_VERSION-windows-x64-binaries.zip" -OutFile $pgZip
    }
    $tmp = Join-Path $cache 'pg_tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $pgZip -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Force -Path $pgDest | Out-Null
    Copy-Item "$tmp\pgsql\*" $pgDest -Recurse -Force

    # Allegement : on supprime tout ce qui est inutile a l'execution
    # (docs, en-tetes, pgAdmin, StackBuilder, symboles de debug...).
    # Cela divise par ~3 la taille et le nombre de fichiers a extraire,
    # donc une installation bien plus rapide.
    Info "Allegement de PostgreSQL (suppression des fichiers inutiles)..."
    $pgTrim = @('doc', 'include', 'pgAdmin 4', 'StackBuilder', 'symbols', 'share\doc')
    foreach ($t in $pgTrim) {
        $p = Join-Path $pgDest $t
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
Ok "PostgreSQL embarque."

# =============================================================================
#  5. Generer les visuels (logo / icone)
# =============================================================================
New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null
$logo = Join-Path $RepoRoot 'client\public\OpenFamily.png'
Copy-Item $logo "$AssetsDir\OpenFamily.png" -Force

# Logo NexaFlow (affiche en bas du panneau, cliquable vers nexaflow.fr).
$nexaLogo = Join-Path $RepoRoot 'logo nexaflow.png'
if (Test-Path $nexaLogo) { Copy-Item $nexaLogo "$AssetsDir\nexaflow.png" -Force }

if (Test-Cmd magick) {
    Info "Generation de l'icone et des visuels (ImageMagick)..."
    magick "$logo" -background none -resize 256x256 -define icon:auto-resize=16,24,32,48,64,128,256 "$AssetsDir\OpenFamily.ico"
    magick -size 164x314 "xc:#0f1117" '(' "$logo" -resize 120x120 ')' -gravity center -composite -alpha remove -type TrueColor "BMP3:$AssetsDir\wizard-large.bmp"
    magick -size 55x58 "xc:#0f1117" '(' "$logo" -resize 48x48 ')' -gravity center -composite -alpha remove -type TrueColor "BMP3:$AssetsDir\wizard-small.bmp"
    Ok "Visuels generes."
} else {
    # Fallback sans ImageMagick : on genere tout via .NET System.Drawing.
    # -> icone ICO multi-resolutions (entrees PNG, format moderne Vista+)
    # -> images BMP 24 bits de l'assistant d'installation.
    Info "Generation de l'icone et des visuels (.NET, sans ImageMagick)..."
    Add-Type -AssemblyName System.Drawing

    $srcImg = [System.Drawing.Image]::FromFile($logo)
    try {
        # --- ICO multi-resolutions ---
        $sizes = @(16, 24, 32, 48, 64, 128, 256)
        $pngs = @()
        foreach ($sz in $sizes) {
            $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($srcImg, 0, 0, $sz, $sz)
            $g.Dispose()
            $ms = New-Object System.IO.MemoryStream
            $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $pngs += , $ms.ToArray()
            $ms.Dispose(); $bmp.Dispose()
        }
        $icoPath = Join-Path $AssetsDir 'OpenFamily.ico'
        $fs = [System.IO.File]::Create($icoPath)
        $bw = New-Object System.IO.BinaryWriter($fs)
        $bw.Write([uint16]0)            # reserved
        $bw.Write([uint16]1)            # type = icone
        $bw.Write([uint16]$sizes.Count) # nombre d'images
        $offset = 6 + (16 * $sizes.Count)
        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $sz = $sizes[$i]; $data = $pngs[$i]
            $dim = if ($sz -ge 256) { 0 } else { $sz }
            $bw.Write([byte]$dim)       # largeur (0 = 256)
            $bw.Write([byte]$dim)       # hauteur (0 = 256)
            $bw.Write([byte]0)          # palette
            $bw.Write([byte]0)          # reserved
            $bw.Write([uint16]1)        # plans
            $bw.Write([uint16]32)       # bits par pixel
            $bw.Write([uint32]$data.Length)
            $bw.Write([uint32]$offset)
            $offset += $data.Length
        }
        foreach ($data in $pngs) { $bw.Write($data) }
        $bw.Flush(); $bw.Close(); $fs.Close()

        # --- Images BMP de l'assistant (style moderne, fond degrade sombre) ---
        # Grande image (panneau gauche des pages Bienvenue / Fin) : degrade
        # corail -> nuit avec logo et wordmark, facon installeur premium.
        function New-WizardLargeBmp($w, $h, $out) {
            $bmp = New-Object System.Drawing.Bitmap($w, $h)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            # Degrade diagonal sombre.
            $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
            $c1 = [System.Drawing.ColorTranslator]::FromHtml('#241226')
            $c2 = [System.Drawing.ColorTranslator]::FromHtml('#0d0d12')
            $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 60.0)
            $g.FillRectangle($grad, $rect)
            $grad.Dispose()
            # Halo corail discret en haut.
            $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
            $gd = [int]($w * 1.4)
            $glowPath.AddEllipse([int]($w / 2 - $gd / 2), [int](-$gd * 0.55), $gd, $gd)
            $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
            $pgb.CenterColor = [System.Drawing.Color]::FromArgb(90, 255, 90, 122)
            $pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 90, 122))
            $g.FillPath($pgb, $glowPath)
            $pgb.Dispose(); $glowPath.Dispose()
            # Logo centre haut.
            $logoSize = [int]($w * 0.42)
            $lx = [int](($w - $logoSize) / 2); $ly = [int]($h * 0.20)
            $g.DrawImage($srcImg, $lx, $ly, $logoSize, $logoSize)
            # Wordmark + tagline.
            $fTitle = New-Object System.Drawing.Font('Segoe UI Semibold', [single]($w * 0.11), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
            $fSub = New-Object System.Drawing.Font('Segoe UI', [single]($w * 0.052), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $brTitle = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255))
            $brSub = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 175, 185))
            $g.DrawString('OpenFamily', $fTitle, $brTitle, (New-Object System.Drawing.RectangleF(0, [single]($h * 0.50), $w, [single]($h * 0.12))), $sf)
            $g.DrawString('Gestion familiale auto-hebergee', $fSub, $brSub, (New-Object System.Drawing.RectangleF(0, [single]($h * 0.60), $w, [single]($h * 0.10))), $sf)
            $g.DrawString('par NexaFlow', $fSub, $brSub, (New-Object System.Drawing.RectangleF(0, [single]($h * 0.90), $w, [single]($h * 0.08))), $sf)
            $fTitle.Dispose(); $fSub.Dispose(); $brTitle.Dispose(); $brSub.Dispose(); $sf.Dispose()
            $g.Dispose()
            $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
            $bmp.Dispose()
        }
        # Petite image (coin haut-droit des pages internes) : logo sur fond sombre.
        function New-WizardSmallBmp($w, $h, $out) {
            $bmp = New-Object System.Drawing.Bitmap($w, $h)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#15121a'))
            $logoSize = [int]($h * 0.72)
            $lx = [int](($w - $logoSize) / 2); $ly = [int](($h - $logoSize) / 2)
            $g.DrawImage($srcImg, $lx, $ly, $logoSize, $logoSize)
            $g.Dispose()
            $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
            $bmp.Dispose()
        }
        # Resolutions genereuses pour rester nettes en HiDPI (Inno les adapte).
        New-WizardLargeBmp 410 797 (Join-Path $AssetsDir 'wizard-large.bmp')
        New-WizardSmallBmp 138 138 (Join-Path $AssetsDir 'wizard-small.bmp')
    } finally {
        $srcImg.Dispose()
    }
    Ok "Visuels generes (.NET)."
}

# =============================================================================
#  5b. Compiler le lanceur natif OpenFamily.exe (remplace OpenFamily.vbs)
# =============================================================================
Info "Compilation du lanceur natif OpenFamily.exe..."
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) {
    Fail "Compilateur C# (csc.exe) introuvable. Installez le .NET Framework 4.x."
}
$launcherSrc = Join-Path $AppDir 'OpenFamilyLauncher.cs'
$launcherExe = Join-Path $AppDir 'OpenFamily.exe'
$launcherIco = Join-Path $AssetsDir 'OpenFamily.ico'
if (Test-Path $launcherExe) { Remove-Item $launcherExe -Force }
& $csc /nologo /target:winexe /platform:x64 `
    "/win32icon:$launcherIco" `
    /reference:System.Windows.Forms.dll `
    "/out:$launcherExe" "$launcherSrc"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $launcherExe)) {
    Fail "La compilation de OpenFamily.exe a echoue."
}
Ok "Lanceur OpenFamily.exe compile."

# =============================================================================
#  5c. Hygiene des fichiers : encodage PowerShell + parasites macOS
# =============================================================================
# PowerShell 5.1 (Windows) lit les .ps1 en ANSI s'il n'y a pas de BOM, ce qui
# casse les accents et caracteres speciaux (ex. le tiret long « — »).
# On force un BOM UTF-8 sur NOS scripts pour un parsing fiable.
Info "Normalisation de l'encodage des scripts PowerShell..."
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$ourScripts = @(
    (Join-Path $AppDir 'OpenFamilyControl.ps1'),
    (Join-Path $AppDir 'engine\common.ps1'),
    (Join-Path $AppDir 'engine\start.ps1'),
    (Join-Path $AppDir 'engine\stop.ps1')
)
foreach ($s in $ourScripts) {
    if (Test-Path $s) {
        $txt = [System.IO.File]::ReadAllText($s)
        [System.IO.File]::WriteAllText($s, $txt, $utf8Bom)
    }
}

# Suppression des fichiers parasites macOS (._* et .DS_Store) qui se glissent
# dans le repo developpe sur Mac et finiraient embarques dans l'installeur.
$junk = Get-ChildItem $AppDir -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '._*' -or $_.Name -eq '.DS_Store' }
if ($junk) { $junk | Remove-Item -Force -ErrorAction SilentlyContinue }
Ok "Scripts encodes (UTF-8 BOM) et fichiers parasites nettoyes."

# =============================================================================
#  6. Compiler l'installeur
# =============================================================================
# Windows Defender peut verrouiller le Setup.exe pendant qu'Inno y grave l'icone
# (« EndUpdateResource failed »). On exclut le dossier de sortie de l'analyse
# temps reel (best-effort : necessite des droits admin) et on reessaie au besoin.
try {
    Add-MpPreference -ExclusionPath $DistDir -ErrorAction Stop
    Add-MpPreference -ExclusionPath $InstallerWin -ErrorAction Stop
    Ok "Dossier de sortie exclu de l'analyse Windows Defender."
} catch {
    Warn "Impossible d'ajouter l'exclusion Defender (lancez en Administrateur si la compilation echoue)."
}

Info "Compilation de OpenFamily-Setup.exe (version $Version)..."
$issFile = Join-Path $InstallerWin 'OpenFamily.iss'
$compiled = $false
for ($attempt = 1; $attempt -le 3 -and -not $compiled; $attempt++) {
    if ($attempt -gt 1) {
        Warn "Nouvelle tentative de compilation ($attempt/3) dans 3 s..."
        Start-Sleep -Seconds 3
    }
    & $ISCC $issFile "/DMyAppVersion=$Version"
    if ($LASTEXITCODE -eq 0) { $compiled = $true }
}
if (-not $compiled) {
    Fail "La compilation Inno Setup a echoue (verrouillage antivirus probable : excluez le dossier dist de votre antivirus)."
}

$exe = Join-Path $DistDir 'OpenFamily-Setup.exe'
if (-not (Test-Path $exe)) { Fail "Installeur introuvable apres compilation." }
Ok "Installeur cree : $exe"
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "   OpenFamily-Setup.exe est pret !" -ForegroundColor Green
Write-Host "   $exe" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host ""

# =============================================================================
#  7. Lancer l'installeur pour le tester
# =============================================================================
if ($Run) {
    Info "Lancement de l'installeur..."
    Start-Process $exe
} elseif (-not $NoPrompt) {
    $ans = Read-Host "Lancer l'installeur maintenant pour le tester ? (O/N)"
    if ($ans -match '^[OoYy]') { Start-Process $exe }
}
