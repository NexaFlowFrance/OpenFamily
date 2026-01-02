# OpenFamily - Installation Windows avec Docker
# Ce script installe et démarre OpenFamily avec PostgreSQL

Write-Host "🚀 OpenFamily - Installation Windows" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

# Vérifier si Docker est installé
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker détecté: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker n'est pas installé." -ForegroundColor Red
    Write-Host ""
    Write-Host "Veuillez installer Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Puis relancez ce script." -ForegroundColor Yellow
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

# Vérifier si Docker est en marche
try {
    docker ps | Out-Null
} catch {
    Write-Host "❌ Docker n'est pas démarré." -ForegroundColor Red
    Write-Host ""
    Write-Host "Veuillez démarrer Docker Desktop puis relancez ce script." -ForegroundColor Yellow
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

Write-Host ""
Write-Host "📂 Création du dossier OpenFamily..." -ForegroundColor Blue

# Créer le dossier OpenFamily
$folderPath = Join-Path $env:USERPROFILE "OpenFamily"
if (-not (Test-Path $folderPath)) {
    New-Item -ItemType Directory -Path $folderPath
    Write-Host "✅ Dossier créé: $folderPath" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Dossier existe déjà: $folderPath" -ForegroundColor Yellow
}

Set-Location $folderPath

# Télécharger docker-compose.yml
Write-Host ""
Write-Host "⬇️  Téléchargement de la configuration..." -ForegroundColor Blue

$composeUrl = "https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml"
$envUrl = "https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example"

try {
    Invoke-WebRequest -Uri $composeUrl -OutFile "docker-compose.yml"
    Write-Host "✅ docker-compose.yml téléchargé" -ForegroundColor Green
    
    Invoke-WebRequest -Uri $envUrl -OutFile ".env.example"
    Write-Host "✅ .env.example téléchargé" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur de téléchargement: $_" -ForegroundColor Red
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

# Créer le fichier .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Fichier .env créé" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Fichier .env existe déjà" -ForegroundColor Yellow
}

# Demander si l'utilisateur veut changer le mot de passe
Write-Host ""
Write-Host "🔐 Configuration du mot de passe" -ForegroundColor Cyan
Write-Host ""
Write-Host "Le mot de passe par défaut est: openfamily_secure_2026" -ForegroundColor Yellow
$response = Read-Host "Voulez-vous le changer? (o/N)"

if ($response -eq "o" -or $response -eq "O") {
    $newPassword = Read-Host "Nouveau mot de passe"
    if ($newPassword) {
        (Get-Content ".env") -replace "DB_PASSWORD=openfamily_secure_2026", "DB_PASSWORD=$newPassword" | Set-Content ".env"
        Write-Host "✅ Mot de passe mis à jour" -ForegroundColor Green
    }
}

# Démarrer OpenFamily
Write-Host ""
Write-Host "🚀 Démarrage d'OpenFamily..." -ForegroundColor Blue
Write-Host ""

try {
    # Utiliser docker compose (nouveau) ou docker-compose (ancien)
    $composeCmd = "docker compose"
    try {
        & docker compose version | Out-Null
    } catch {
        $composeCmd = "docker-compose"
    }
    
    Write-Host "Téléchargement des images Docker (peut prendre quelques minutes)..." -ForegroundColor Yellow
    
    # Démarrer en mode détaché
    $process = Start-Process -FilePath "docker" -ArgumentList "compose", "up", "-d" -Wait -PassThru
    
    if ($process.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "🎉 OpenFamily a été installé avec succès!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Application web: http://localhost:3000" -ForegroundColor Cyan
        Write-Host "🐘 Base de données: localhost:5432" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "📁 Dossier d'installation: $folderPath" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Commandes utiles:" -ForegroundColor Yellow
        Write-Host "  - Voir les logs: docker compose logs -f" -ForegroundColor Gray
        Write-Host "  - Arrêter: docker compose down" -ForegroundColor Gray
        Write-Host "  - Mettre à jour: docker compose pull && docker compose up -d" -ForegroundColor Gray
        Write-Host ""
        
        # Demander si on ouvre le navigateur
        $openBrowser = Read-Host "Ouvrir l'application dans le navigateur? (O/n)"
        if ($openBrowser -ne "n" -and $openBrowser -ne "N") {
            Start-Process "http://localhost:3000"
        }
        
    } else {
        Write-Host "❌ Erreur lors du démarrage" -ForegroundColor Red
        Write-Host "Consultez les logs avec: docker compose logs" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
}

Write-Host ""
Read-Host "Appuyez sur Entrée pour quitter"