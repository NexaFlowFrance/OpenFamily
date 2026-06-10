; =============================================================================
;  OpenFamily — Installeur Windows (.exe) — version native (sans Docker)
;  Edite par NexaFlow — https://nexaflow.fr
;  Page du projet : https://nexaflowfrance.github.io/OpenFamily/
;
;  L'installeur embarque tout le necessaire : Node.js, PostgreSQL et l'app.
;  Aucune dependance externe, aucune virtualisation, aucun redemarrage.
;  L'utilisateur final ne voit qu'une fenetre graphique avec 3 boutons.
;
;  Compilation : Inno Setup 6.1+  (ISCC.exe OpenFamily.iss /DMyAppVersion=1.1.0)
;  Les dossiers app\runtime\node, app\runtime\pgsql, app\server, app\client,
;  app\schema.sql et les assets sont prepares par la CI avant compilation.
; =============================================================================

#ifndef MyAppVersion
  #define MyAppVersion "1.1.0"
#endif

#define MyAppName "OpenFamily"
#define MyPublisher "NexaFlow"
#define MyPublisherURL "https://nexaflow.fr"
#define MyProjectURL "https://nexaflowfrance.github.io/OpenFamily/"

[Setup]
AppId={{B7E3F1A2-9C44-4F0B-AE11-0F2A1C9D7E55}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyPublisher}
AppPublisherURL={#MyPublisherURL}
AppSupportURL={#MyProjectURL}
AppUpdatesURL={#MyProjectURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist\windows
OutputBaseFilename=OpenFamily-Setup
; Compression non-solide : l'extraction a l'installation est nettement plus
; rapide (les fichiers sont decompresses independamment) au prix d'une taille
; de setup un peu plus grande.
Compression=lzma2/normal
SolidCompression=no
WizardStyle=modern
WizardSizePercent=120
DisableWelcomePage=no
; Affiche le choix de langue (anglais / français) au lancement de l'installeur.
ShowLanguageDialog=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=assets\OpenFamily.ico
UninstallDisplayIcon={app}\assets\OpenFamily.ico
UninstallDisplayName={#MyAppName}
WizardImageFile=assets\wizard-large.bmp
WizardSmallImageFile=assets\wizard-small.bmp

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french";  MessagesFile: "compiler:Languages\French.isl"

[CustomMessages]
english.DesktopIcon=Create a desktop shortcut
french.DesktopIcon=Creer un raccourci sur le Bureau
english.Shortcuts=Shortcuts:
french.Shortcuts=Raccourcis :
english.OpenControlPanel=Open the OpenFamily control panel
french.OpenControlPanel=Ouvrir le panneau de controle OpenFamily
english.SiteLink=OpenFamily website (NexaFlow)
french.SiteLink=Site OpenFamily (NexaFlow)
english.UninstallLink=Uninstall OpenFamily
french.UninstallLink=Desinstaller OpenFamily
english.OpenNow=Open OpenFamily now
french.OpenNow=Ouvrir OpenFamily maintenant

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:Shortcuts}"; Flags: checkedonce

[Files]
; Application (client + serveur compiles) et schema de base
Source: "app\OpenFamily.exe";        DestDir: "{app}"; Flags: ignoreversion
Source: "app\OpenFamilyControl.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "app\schema.sql";            DestDir: "{app}"; Flags: ignoreversion
Source: "app\engine\*";              DestDir: "{app}\engine"; Flags: ignoreversion recursesubdirs
Source: "app\server\*";              DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs
Source: "app\client\*";              DestDir: "{app}\client"; Flags: ignoreversion recursesubdirs
; Runtimes embarques (prepares par la CI)
Source: "app\runtime\*";             DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs
; Visuels (logo OpenFamily)
Source: "assets\OpenFamily.ico";     DestDir: "{app}\assets"; Flags: ignoreversion
Source: "assets\OpenFamily.png";     DestDir: "{app}\assets"; Flags: ignoreversion
Source: "assets\nexaflow.png";       DestDir: "{app}\assets"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Raccourci principal -> panneau de controle graphique (logo OpenFamily)
Name: "{group}\OpenFamily";                 Filename: "{app}\OpenFamily.exe"; IconFilename: "{app}\assets\OpenFamily.ico"; Comment: "{cm:OpenControlPanel}"
Name: "{group}\{cm:SiteLink}";              Filename: "{#MyProjectURL}"
Name: "{group}\{cm:UninstallLink}";        Filename: "{uninstallexe}"
Name: "{autodesktop}\OpenFamily";           Filename: "{app}\OpenFamily.exe"; IconFilename: "{app}\assets\OpenFamily.ico"; Tasks: desktopicon; Comment: "{cm:OpenControlPanel}"

[Run]
; Ouverture du panneau de controle a la fin de l'installation
Filename: "{app}\OpenFamily.exe"; Description: "{cm:OpenNow}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; Arret propre des services avant desinstallation
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\engine\stop.ps1"""; Flags: runhidden; RunOnceId: "StopOpenFamily"

[Messages]
english.WelcomeLabel2=This wizard will install [name] on your computer.%n%nOpenFamily is a self-hosted family app published by NexaFlow (https://nexaflow.fr).%n%nEverything is included: no extra install, no virtualization, no reboot. Once installed, open OpenFamily and click Start.
french.WelcomeLabel2=Cet assistant va installer [name] sur votre ordinateur.%n%nOpenFamily est une application familiale auto-hebergee editee par NexaFlow (https://nexaflow.fr).%n%nTout est inclus : aucune installation supplementaire, aucune virtualisation, aucun redemarrage. Une fois installe, ouvrez OpenFamily et cliquez sur Demarrer.
