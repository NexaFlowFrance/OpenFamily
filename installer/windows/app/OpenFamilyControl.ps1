# =============================================================================
#  OpenFamily — Panneau de controle (application graphique premium)
#  Editee par NexaFlow — https://nexaflow.fr
#  Page du projet : https://nexaflowfrance.github.io/OpenFamily/
#
#  Theme sombre translucide (verre depoli acrylique facon Windows 11), unique
#  mode de l'application Windows. Permet de Demarrer / Arreter / Ouvrir
#  OpenFamily, affiche l'adresse d'acces reseau et la configuration Tailscale.
# =============================================================================

. (Join-Path $PSScriptRoot 'engine\common.ps1')
Initialize-OFDirs

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

# --- Interop Windows : flou acrylique + barre sombre + coins arrondis ---------
if (-not ([System.Management.Automation.PSTypeName]'OFWin').Type) {
    Add-Type -Namespace 'OF' -Name 'Win' -MemberDefinition @'
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct AccentPolicy { public int AccentState; public int AccentFlags; public uint GradientColor; public int AnimationId; }

[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct WinCompAttrData { public int Attribute; public System.IntPtr Data; public int SizeOfData; }

[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern int SetWindowCompositionAttribute(System.IntPtr hwnd, ref WinCompAttrData data);

[System.Runtime.InteropServices.DllImport("dwmapi.dll")]
public static extern int DwmSetWindowAttribute(System.IntPtr hwnd, int attr, ref int val, int size);

[System.Runtime.InteropServices.DllImport("shell32.dll", SetLastError = true)]
public static extern void SetCurrentProcessExplicitAppUserModelID([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string AppID);

public static void EnableAcrylic(System.IntPtr handle, uint tint) {
    var accent = new AccentPolicy();
    accent.AccentState = 4; // ACCENT_ENABLE_ACRYLICBLURBEHIND
    accent.AccentFlags = 2; // draw all borders
    accent.GradientColor = tint; // 0xAABBGGRR
    int size = System.Runtime.InteropServices.Marshal.SizeOf(accent);
    System.IntPtr ptr = System.Runtime.InteropServices.Marshal.AllocHGlobal(size);
    System.Runtime.InteropServices.Marshal.StructureToPtr(accent, ptr, false);
    var data = new WinCompAttrData();
    data.Attribute = 19; // WCA_ACCENT_POLICY
    data.SizeOfData = size;
    data.Data = ptr;
    SetWindowCompositionAttribute(handle, ref data);
    System.Runtime.InteropServices.Marshal.FreeHGlobal(ptr);
}

public static void ModernFrame(System.IntPtr handle) {
    int dark = 1;  DwmSetWindowAttribute(handle, 20, ref dark, 4);   // dark title bar
    int round = 2; DwmSetWindowAttribute(handle, 33, ref round, 4);  // rounded corners
}
'@
}

# Identite d'application distincte : evite que la fenetre soit regroupee sous
# l'icone PowerShell dans la barre des taches (elle aura sa propre icone).
try { [OF.Win]::SetCurrentProcessExplicitAppUserModelID('NexaFlow.OpenFamily.Panel') } catch { }

$IconPath = Join-Path $OFRoot 'assets\OpenFamily.ico'
$LogoPath = Join-Path $OFRoot 'assets\OpenFamily.png'
# Fallback (apercu hors installation) : logo source du client.
if (-not (Test-Path $LogoPath)) {
    $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    $alt = Join-Path $repoRoot 'client\public\OpenFamily.png'
    if (Test-Path $alt) { $LogoPath = $alt }
}

# Logo NexaFlow (bas de page, cliquable).
$NexaLogoPath = Join-Path $OFRoot 'assets\nexaflow.png'
if (-not (Test-Path $NexaLogoPath)) {
    $repoRootN = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    $altN = Join-Path $repoRootN 'logo nexaflow.png'
    if (Test-Path $altN) { $NexaLogoPath = $altN }
}

# --- Palette OpenFamily (theme sombre premium) -------------------------------
$cBg       = [System.Drawing.Color]::FromArgb(18, 18, 22)      # fond (sous l'acrylique)
$cCard     = [System.Drawing.Color]::FromArgb(30, 30, 36)      # cartes
$cCardHi   = [System.Drawing.Color]::FromArgb(38, 38, 46)      # carte survolee / champ
$cBorder   = [System.Drawing.Color]::FromArgb(52, 52, 60)
$cPrimary  = [System.Drawing.Color]::FromArgb(255, 90, 122)    # corail OpenFamily
$cPrimaryH = [System.Drawing.Color]::FromArgb(242, 79, 112)
$cPrimarySoft = [System.Drawing.Color]::FromArgb(48, 24, 32)
$cSuccess  = [System.Drawing.Color]::FromArgb(46, 204, 113)
$cSuccessH = [System.Drawing.Color]::FromArgb(39, 174, 96)
$cText     = [System.Drawing.Color]::FromArgb(245, 246, 250)
$cMuted    = [System.Drawing.Color]::FromArgb(160, 162, 170)
$cWarn     = [System.Drawing.Color]::FromArgb(245, 170, 60)

$fontFamily = 'Segoe UI'

# --- Helper : coins arrondis (region GraphicsPath) ---------------------------
function Set-RoundedRegion {
    param([System.Windows.Forms.Control]$Control, [int]$Radius = 14)
    $apply = {
        param($ctrl, $r)
        $w = $ctrl.Width; $h = $ctrl.Height; $d = [Math]::Max(1, $r * 2)
        if ($w -le $d -or $h -le $d) { return }
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $d, $d, 180, 90)
        $path.AddArc($w - $d, 0, $d, $d, 270, 90)
        $path.AddArc($w - $d, $h - $d, $d, $d, 0, 90)
        $path.AddArc(0, $h - $d, $d, $d, 90, 90)
        $path.CloseFigure()
        $ctrl.Region = New-Object System.Drawing.Region($path)
    }
    & $apply $Control $Radius
    $Control.Add_Resize({ & $apply $this $Radius }.GetNewClosure())
}

# --- Helper : carte (panel arrondi) ------------------------------------------
function New-OFCard {
    param([int]$X, [int]$Y, [int]$W, [int]$H, [System.Drawing.Color]$Color = $cCard)
    $card = New-Object System.Windows.Forms.Panel
    $card.Location = New-Object System.Drawing.Point($X, $Y)
    $card.Size = New-Object System.Drawing.Size($W, $H)
    $card.BackColor = $Color
    Set-RoundedRegion -Control $card -Radius 16
    return $card
}

# --- Helper : bouton arrondi (dessine, coins lisses anti-alias) --------------
function New-OFButton {
    param([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H,
        [System.Drawing.Color]$Back, [System.Drawing.Color]$Fore,
        [System.Drawing.Color]$HoverBack, [int]$FontSize = 10, [bool]$Bold = $true,
        [System.Drawing.Color]$Behind = $cCard)
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $Text
    $b.Location = New-Object System.Drawing.Point($X, $Y)
    $b.Size = New-Object System.Drawing.Size($W, $H)
    $b.FlatStyle = 'Flat'
    $b.FlatAppearance.BorderSize = 0
    $b.FlatAppearance.MouseOverBackColor = $Behind
    $b.FlatAppearance.MouseDownBackColor = $Behind
    $b.BackColor = $Behind
    $b.ForeColor = $Fore
    $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $b.Font = New-Object System.Drawing.Font($fontFamily, $FontSize, $style)
    $b.Cursor = 'Hand'
    $b.TabStop = $false
    $b | Add-Member -NotePropertyName OFBack -NotePropertyValue $Back -Force
    $b | Add-Member -NotePropertyName OFHover -NotePropertyValue $HoverBack -Force
    $b | Add-Member -NotePropertyName OFBehind -NotePropertyValue $Behind -Force
    $b | Add-Member -NotePropertyName OFHot -NotePropertyValue $false -Force
    $b.Add_MouseEnter({ $this.OFHot = $true; $this.Invalidate() })
    $b.Add_MouseLeave({ $this.OFHot = $false; $this.Invalidate() })
    $b.Add_EnabledChanged({ $this.Invalidate() })
    $b.Add_Paint({
        param($s, $e)
        $g = $e.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        # Couleur EXACTE du parent : les coins se fondent parfaitement,
        # aucun rectangle visible (le fond etant opaque).
        $bg = if ($s.Parent) { $s.Parent.BackColor } else { $s.OFBehind }
        $g.Clear($bg)
        $rad = [Math]::Min(12, [int]($s.Height / 2))
        $d = [Math]::Max(2, $rad * 2)
        $w = $s.Width; $h = $s.Height
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $d, $d, 180, 90)
        $path.AddArc($w - $d - 1, 0, $d, $d, 270, 90)
        $path.AddArc($w - $d - 1, $h - $d - 1, $d, $d, 0, 90)
        $path.AddArc(0, $h - $d - 1, $d, $d, 90, 90)
        $path.CloseFigure()
        $fill = if (-not $s.Enabled) { [System.Drawing.Color]::FromArgb(46, 46, 54) }
                elseif ($s.OFHot) { $s.OFHover } else { $s.OFBack }
        $brush = New-Object System.Drawing.SolidBrush($fill)
        $g.FillPath($brush, $path)
        $brush.Dispose()
        $txtColor = if (-not $s.Enabled) { [System.Drawing.Color]::FromArgb(120, 120, 130) } else { $s.ForeColor }
        $flags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor `
            [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor `
            [System.Windows.Forms.TextFormatFlags]::EndEllipsis
        [System.Windows.Forms.TextRenderer]::DrawText($g, $s.Text, $s.Font, $s.ClientRectangle, $txtColor, $flags)
        $path.Dispose()
    })
    return $b
}

# --- Helper : label ----------------------------------------------------------
function New-OFLabel {
    param([string]$Text, [int]$X, [int]$Y, [System.Drawing.Color]$Color = $cText,
        [int]$FontSize = 10, [bool]$Bold = $false, [int]$Width = 0)
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.ForeColor = $Color
    $l.BackColor = [System.Drawing.Color]::Transparent
    $l.Location = New-Object System.Drawing.Point($X, $Y)
    $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $l.Font = New-Object System.Drawing.Font($fontFamily, $FontSize, $style)
    if ($Width -gt 0) { $l.Size = New-Object System.Drawing.Size($Width, 20); $l.AutoSize = $false }
    else { $l.AutoSize = $true }
    return $l
}

# --- Fenetre principale ------------------------------------------------------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'OpenFamily'
$form.ClientSize = New-Object System.Drawing.Size(520, 640)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = $cBg
$form.ForeColor = $cText
$form.Font = New-Object System.Drawing.Font($fontFamily, 9.5)
if (Test-Path $IconPath) { $form.Icon = New-Object System.Drawing.Icon($IconPath) }

# Barre de titre sombre + coins arrondis (fenetre). Fond solide premium :
# pas de verre acrylique translucide, qui empechait les boutons de se fondre
# proprement (rectangles visibles dans les coins). Style « solide » facon Discord.
$form.Add_Shown({
    try {
        [OF.Win]::ModernFrame($form.Handle)
    } catch { }
})

# ============================ EN-TETE ========================================
$logoShown = $false
if (Test-Path $LogoPath) {
    try {
        $logo = New-Object System.Windows.Forms.PictureBox
        $logo.Image = [System.Drawing.Image]::FromFile($LogoPath)
        $logo.SizeMode = 'Zoom'
        $logo.Size = New-Object System.Drawing.Size(52, 52)
        $logo.Location = New-Object System.Drawing.Point(24, 20)
        $logo.BackColor = [System.Drawing.Color]::Transparent
        $form.Controls.Add($logo)
        $logoShown = $true
    } catch { }
}

$titleX = if ($logoShown) { 88 } else { 24 }
$title = New-OFLabel 'OpenFamily' $titleX 22 $cPrimary 18 $true
$form.Controls.Add($title)

$subtitle = New-OFLabel 'Gestion familiale auto-hébergée · par NexaFlow' ($titleX + 2) 54 $cMuted 9.5 $false
$form.Controls.Add($subtitle)

# ============================ NAVIGATION =====================================
$navAccueil = New-OFButton 'Accueil' 24 92 (140) 38 $cCard $cText $cCardHi 10 $true $cBg
$navReseau  = New-OFButton 'Accès et réseau' 172 92 (160) 38 $cBg $cMuted $cCardHi 10 $false $cBg
$navAccueil.UseMnemonic = $false
$navReseau.UseMnemonic = $false
$form.Controls.Add($navAccueil)
$form.Controls.Add($navReseau)

# ============================ PAGE ACCUEIL ===================================
$pageHome = New-Object System.Windows.Forms.Panel
$pageHome.Location = New-Object System.Drawing.Point(0, 144)
$pageHome.Size = New-Object System.Drawing.Size(520, 496)
$pageHome.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($pageHome)

# Carte etat + actions
$cardMain = New-OFCard 24 8 (472) 160
$pageHome.Controls.Add($cardMain)

$statusDot = New-OFLabel '●' 22 18 $cMuted 13 $true
$cardMain.Controls.Add($statusDot)
$statusLabel = New-OFLabel 'Vérification…' 44 21 $cText 11.5 $true
$cardMain.Controls.Add($statusLabel)

$btnStart = New-OFButton 'Démarrer' 20 66 (136) 50 $cPrimary ([System.Drawing.Color]::White) $cPrimaryH 11 $true
$btnStop  = New-OFButton 'Arrêter'  168 66 (136) 50 $cCardHi $cText $cBorder 11 $true
$btnOpen  = New-OFButton 'Ouvrir'   316 66 (136) 50 $cSuccess ([System.Drawing.Color]::White) $cSuccessH 11 $true
$cardMain.Controls.AddRange(@($btnStart, $btnStop, $btnOpen))

$hintStart = New-OFLabel 'Au 1er démarrage, la base se configure : patientez ~1 min.' 20 126 $cMuted 8.5 $false
$cardMain.Controls.Add($hintStart)

# Carte acces reseau
$cardAccess = New-OFCard 24 180 (472) 220
$pageHome.Controls.Add($cardAccess)

$accessTitle = New-OFLabel 'Accès depuis vos appareils' 20 18 $cText 11 $true
$cardAccess.Controls.Add($accessTitle)

$lblLocalTitle = New-OFLabel 'Sur cet ordinateur' 20 56 $cMuted 9.5 $false
$cardAccess.Controls.Add($lblLocalTitle)
$lblLocal = New-Object System.Windows.Forms.LinkLabel
$lblLocal.Text = "http://localhost:$OFAppPort"
$lblLocal.LinkColor = $cPrimary
$lblLocal.ActiveLinkColor = $cPrimaryH
$lblLocal.LinkBehavior = 'HoverUnderline'
$lblLocal.AutoSize = $true
$lblLocal.BackColor = [System.Drawing.Color]::Transparent
$lblLocal.Font = New-Object System.Drawing.Font($fontFamily, 9.5, [System.Drawing.FontStyle]::Bold)
$lblLocal.Location = New-Object System.Drawing.Point(180, 56)
$cardAccess.Controls.Add($lblLocal)

$lblLanTitle = New-OFLabel 'Depuis un mobile (même Wi-Fi / box)' 20 92 $cMuted 9.5 $false
$cardAccess.Controls.Add($lblLanTitle)

$lblLan = New-Object System.Windows.Forms.TextBox
$lblLan.ReadOnly = $true
$lblLan.BorderStyle = 'None'
$lblLan.BackColor = $cCardHi
$lblLan.ForeColor = $cPrimary
$lblLan.Font = New-Object System.Drawing.Font('Consolas', 12, [System.Drawing.FontStyle]::Bold)
$lblLan.Size = New-Object System.Drawing.Size(264, 22)
$lblLan.TabStop = $false
$lanHost = New-Object System.Windows.Forms.Panel
$lanHost.Location = New-Object System.Drawing.Point(20, 116)
$lanHost.Size = New-Object System.Drawing.Size(290, 38)
$lanHost.BackColor = $cCardHi
Set-RoundedRegion -Control $lanHost -Radius 10
$lblLan.Location = New-Object System.Drawing.Point(14, 9)
$lanHost.Controls.Add($lblLan)
$cardAccess.Controls.Add($lanHost)

$btnCopy = New-OFButton 'Copier' 322 116 (90) 38 $cPrimarySoft $cPrimary $cPrimarySoft 9.5 $true
$cardAccess.Controls.Add($btnCopy)

$lblHint = New-OFLabel "Astuce : ouvrez cette adresse dans le navigateur du mobile, puis" 20 166 $cMuted 9 $false
$cardAccess.Controls.Add($lblHint)
$lblHint2 = New-OFLabel "« Ajouter à l'écran d'accueil » pour une vraie application." 20 184 $cMuted 9 $false
$cardAccess.Controls.Add($lblHint2)

# Liens bas de page
$footY = 414
$nexaShown = $false
if (Test-Path $NexaLogoPath) {
    try {
        $nexaLogo = New-Object System.Windows.Forms.PictureBox
        $nexaLogo.Image = [System.Drawing.Image]::FromFile($NexaLogoPath)
        $nexaLogo.SizeMode = 'Zoom'
        $nexaLogo.Size = New-Object System.Drawing.Size(132, 30)
        $nexaLogo.Location = New-Object System.Drawing.Point(24, $footY)
        $nexaLogo.BackColor = [System.Drawing.Color]::Transparent
        $nexaLogo.Cursor = 'Hand'
        $tip = New-Object System.Windows.Forms.ToolTip
        $tip.SetToolTip($nexaLogo, 'nexaflow.fr')
        $nexaLogo.Add_Click({ Start-Process 'https://nexaflow.fr' })
        $pageHome.Controls.Add($nexaLogo)
        $nexaShown = $true
    } catch { }
}
if (-not $nexaShown) {
    $linkSite = New-Object System.Windows.Forms.LinkLabel
    $linkSite.Text = 'NexaFlow'
    $linkSite.LinkColor = $cMuted
    $linkSite.ActiveLinkColor = $cPrimary
    $linkSite.AutoSize = $true
    $linkSite.BackColor = [System.Drawing.Color]::Transparent
    $linkSite.Location = New-Object System.Drawing.Point(24, ($footY + 6))
    $linkSite.Add_LinkClicked({ Start-Process 'https://nexaflow.fr' })
    $pageHome.Controls.Add($linkSite)
}

$linkProject = New-Object System.Windows.Forms.LinkLabel
$linkProject.Text = 'Documentation'
$linkProject.LinkColor = $cMuted
$linkProject.ActiveLinkColor = $cPrimary
$linkProject.AutoSize = $true
$linkProject.BackColor = [System.Drawing.Color]::Transparent
$linkProject.Location = New-Object System.Drawing.Point(384, ($footY + 6))
$pageHome.Controls.Add($linkProject)

# ============================ PAGE RESEAU ====================================
$pageReseau = New-Object System.Windows.Forms.Panel
$pageReseau.Location = New-Object System.Drawing.Point(0, 144)
$pageReseau.Size = New-Object System.Drawing.Size(520, 496)
$pageReseau.BackColor = [System.Drawing.Color]::Transparent
$pageReseau.Visible = $false
$form.Controls.Add($pageReseau)

$cardHome = New-OFCard 24 8 (472) 200
$pageReseau.Controls.Add($cardHome)
$lblHomeTitle = New-OFLabel '1 · À la maison (même réseau Wi-Fi)' 20 18 $cPrimary 11 $true
$cardHome.Controls.Add($lblHomeTitle)
$noticeHome = New-OFLabel ("- Connectez le téléphone au même Wi-Fi / box que ce PC.`r`n" +
    "- Dans le navigateur du téléphone, tapez l'adresse de l'onglet`r`n" +
    "  Accueil (par ex. http://192.168.x.x:$OFAppPort).`r`n" +
    "- Si la page ne s'ouvre pas, autorisez OpenFamily dans le`r`n" +
    "  pare-feu Windows avec le bouton ci-dessous.") 20 50 $cText 9.5 $false
$noticeHome.MaximumSize = New-Object System.Drawing.Size(432, 0)
$cardHome.Controls.Add($noticeHome)
$btnFirewall = New-OFButton 'Autoriser dans le pare-feu Windows' 20 152 (260) 36 $cCardHi $cText $cBorder 9.5 $false
$cardHome.Controls.Add($btnFirewall)

$cardTs = New-OFCard 24 220 (472) 200
$pageReseau.Controls.Add($cardTs)
$lblTsTitle = New-OFLabel '2 · En dehors de chez vous, via Tailscale' 20 18 $cPrimary 11 $true
$cardTs.Controls.Add($lblTsTitle)
$noticeTs = New-OFLabel ("Tailscale crée un réseau privé sécurisé entre vos appareils,`r`n" +
    "gratuitement.`r`n" +
    "- Installez Tailscale sur ce PC (bouton) et connectez-vous.`r`n" +
    "- Installez l'appli Tailscale sur le mobile, même compte.`r`n" +
    "- Ouvrez http://<ip-tailscale>:$OFAppPort depuis partout.") 20 50 $cText 9.5 $false
$noticeTs.MaximumSize = New-Object System.Drawing.Size(432, 0)
$cardTs.Controls.Add($noticeTs)
$btnTsInstall = New-OFButton 'Installer Tailscale' 20 152 (160) 36 $cPrimary ([System.Drawing.Color]::White) $cPrimaryH 9.5 $true
$cardTs.Controls.Add($btnTsInstall)
$lblTsIp = New-OFLabel 'IP Tailscale : non détectée' 196 162 $cMuted 9 $false
$cardTs.Controls.Add($lblTsIp)

# ============================ LOGIQUE / ACTIONS =============================
$script:OFStarting = $false
$localIp = Get-OFLocalIP
$lanUrl = "http://${localIp}:$OFAppPort"
$lblLan.Text = $lanUrl

function Show-OFPage([string]$Name) {
    if ($Name -eq 'home') {
        $pageHome.Visible = $true; $pageReseau.Visible = $false
        $navAccueil.OFBack = $cCard; $navAccueil.ForeColor = $cText
        $navAccueil.Font = New-Object System.Drawing.Font($fontFamily, 10, [System.Drawing.FontStyle]::Bold)
        $navReseau.OFBack = $cBg; $navReseau.ForeColor = $cMuted
        $navReseau.Font = New-Object System.Drawing.Font($fontFamily, 10, [System.Drawing.FontStyle]::Regular)
    } else {
        $pageHome.Visible = $false; $pageReseau.Visible = $true
        $navReseau.OFBack = $cCard; $navReseau.ForeColor = $cText
        $navReseau.Font = New-Object System.Drawing.Font($fontFamily, 10, [System.Drawing.FontStyle]::Bold)
        $navAccueil.OFBack = $cBg; $navAccueil.ForeColor = $cMuted
        $navAccueil.Font = New-Object System.Drawing.Font($fontFamily, 10, [System.Drawing.FontStyle]::Regular)
    }
    $navAccueil.Invalidate(); $navReseau.Invalidate()
}

function Invoke-OFEngine([string]$Script) {
    $path = Join-Path $OFRoot "engine\$Script"
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$path`"") `
        -WindowStyle Hidden
}

function Update-OFStatus {
    if (Test-OFServerPort) {
        $script:OFStarting = $false
        $statusDot.ForeColor = $cSuccess
        $statusLabel.Text = "En cours d'exécution"
        $btnStart.Enabled = $false
        $btnStop.Enabled = $true
        $btnOpen.Enabled = $true
    } elseif ($script:OFStarting) {
        $btnOpen.Enabled = $false
    } else {
        $statusDot.ForeColor = $cMuted
        $statusLabel.Text = 'Arrêté'
        $btnStart.Enabled = $true
        $btnStop.Enabled = $false
        $btnOpen.Enabled = $false
    }
    $ts = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -like '100.*' } | Select-Object -First 1 -ExpandProperty IPAddress
    if ($ts) { $lblTsIp.Text = "IP Tailscale : http://${ts}:$OFAppPort" }
}

$navAccueil.Add_Click({ Show-OFPage 'home' })
$navReseau.Add_Click({ Show-OFPage 'reseau' })

$btnStart.Add_Click({
    $script:OFStarting = $true
    $statusLabel.Text = 'Démarrage en cours…'
    $statusDot.ForeColor = $cWarn
    $btnStart.Enabled = $false
    $btnStop.Enabled = $false
    $form.Refresh()
    Invoke-OFEngine 'start.ps1'
})
$btnStop.Add_Click({
    $script:OFStarting = $false
    $statusLabel.Text = 'Arrêt en cours…'
    $statusDot.ForeColor = $cWarn
    $btnStop.Enabled = $false
    $form.Refresh()
    Invoke-OFEngine 'stop.ps1'
})
$btnOpen.Add_Click({ Start-Process "http://localhost:$OFAppPort" })
$lblLocal.Add_LinkClicked({ Start-Process "http://localhost:$OFAppPort" })
$btnCopy.Add_Click({
    [System.Windows.Forms.Clipboard]::SetText($lanUrl)
    $btnCopy.Text = 'Copié !'
})
$linkProject.Add_LinkClicked({ Start-Process 'https://nexaflowfrance.github.io/OpenFamily/' })
$btnFirewall.Add_Click({
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
        '-NoProfile', '-Command',
        "New-NetFirewallRule -DisplayName 'OpenFamily' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $OFAppPort -ErrorAction SilentlyContinue"
    )
    [System.Windows.Forms.MessageBox]::Show('La règle de pare-feu pour OpenFamily a été ajoutée (port ' + $OFAppPort + ').', 'Pare-feu', 'OK', 'Information') | Out-Null
})
$btnTsInstall.Add_Click({ Start-Process 'https://tailscale.com/download/windows' })

# Rafraichissement periodique de l'etat
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Update-OFStatus })
$timer.Start()

Show-OFPage 'home'
Update-OFStatus

[void]$form.ShowDialog()
$timer.Stop()
