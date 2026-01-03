#!/bin/bash

# OpenFamily - Installation Linux/macOS avec Docker
# Ce script installe et démarre OpenFamily avec PostgreSQL

set -e

echo "🚀 OpenFamily - Installation Linux/macOS"
echo "========================================="
echo ""

# Fonction pour vérifier si une commande existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Fonction pour installer Docker sur Ubuntu/Debian
install_docker_ubuntu() {
    echo "📦 Installation de Docker sur Ubuntu/Debian..."
    sudo apt update
    sudo apt install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      \"$(. /etc/os-release && echo \"$VERSION_CODENAME\")\" stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker $USER
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✅ Docker installé! Veuillez redémarrer votre session pour utiliser Docker sans sudo."
}

# Vérifier si Docker est installé
if ! command_exists docker; then
    echo "❌ Docker n'est pas installé."
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Sur macOS, veuillez installer Docker Desktop:"
        echo "  https://www.docker.com/products/docker-desktop/"
        exit 1
    elif command_exists apt; then
        echo "Voulez-vous installer Docker automatiquement? (O/n)"
        read -r response
        if [[ $response == "n" || $response == "N" ]]; then
            echo "Veuillez installer Docker manuellement puis relancer ce script."
            exit 1
        fi
        install_docker_ubuntu
        echo ""
        echo "Redémarrez votre session (ou tapez 'newgrp docker') puis relancez ce script."
        exit 0
    else
        echo "Veuillez installer Docker manuellement pour votre distribution."
        echo "Consultez: https://docs.docker.com/engine/install/"
        exit 1
    fi
fi

# Vérifier si Docker fonctionne
if ! docker ps >/dev/null 2>&1; then
    echo "❌ Docker n'est pas démarré ou vous n'avez pas les permissions."
    echo ""
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Sur macOS, assurez-vous que Docker Desktop est démarré."
    else
        echo "Essayez:"
        echo "  sudo systemctl start docker"
        echo "  sudo usermod -aG docker $USER"
        echo "  newgrp docker"
    fi
    exit 1
fi

echo "✅ Docker détecté: $(docker --version)"
echo ""

# Créer le dossier OpenFamily
FOLDER_PATH="$HOME/OpenFamily"
echo "📂 Création du dossier OpenFamily..."

if [ ! -d "$FOLDER_PATH" ]; then
    mkdir -p "$FOLDER_PATH"
    echo "✅ Dossier créé: $FOLDER_PATH"
else
    echo "ℹ️  Dossier existe déjà: $FOLDER_PATH"
fi

cd "$FOLDER_PATH"

# Télécharger docker-compose.yml
echo ""
echo "⬇️  Téléchargement de la configuration..."

COMPOSE_URL="https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml"
ENV_URL="https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example"

if command_exists curl; then
    curl -o docker-compose.yml "$COMPOSE_URL"
    curl -o .env.example "$ENV_URL"
elif command_exists wget; then
    wget -O docker-compose.yml "$COMPOSE_URL"
    wget -O .env.example "$ENV_URL"
else
    echo "❌ curl ou wget requis pour télécharger les fichiers"
    exit 1
fi

echo "✅ Fichiers de configuration téléchargés"

# Créer le fichier .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Fichier .env créé"
else
    echo "ℹ️  Fichier .env existe déjà"
fi

# Demander si l'utilisateur veut changer le mot de passe
echo ""
echo "🔐 Configuration du mot de passe"
echo ""
echo "Le mot de passe par défaut est: openfamily_secure_2026"
echo -n "Voulez-vous le changer? (o/N): "
read -r response

if [[ $response == "o" || $response == "O" ]]; then
    echo -n "Nouveau mot de passe: "
    read -r new_password
    if [ -n "$new_password" ]; then
        sed -i.bak "s/DB_PASSWORD=openfamily_secure_2026/DB_PASSWORD=$new_password/" .env
        echo "✅ Mot de passe mis à jour"
    fi
fi

# Démarrer OpenFamily
echo ""
echo "🚀 Démarrage d'OpenFamily..."
echo ""

# Vérifier si docker compose est disponible
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command_exists docker-compose; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Ni 'docker compose' ni 'docker-compose' n'est disponible"
    exit 1
fi

echo "Téléchargement des images Docker (peut prendre quelques minutes)..."

if $COMPOSE_CMD up -d; then
    echo ""
    echo "🎉 OpenFamily a été installé avec succès!"
    echo ""
    echo "📊 Application web: http://localhost:3000"
    echo "🐘 Base de données: localhost:5432"
    echo ""
    echo "📁 Dossier d'installation: $FOLDER_PATH"
    echo ""
    echo "Commandes utiles:"
    echo "  - Voir les logs: $COMPOSE_CMD logs -f"
    echo "  - Arrêter: $COMPOSE_CMD down"
    echo "  - Mettre à jour: $COMPOSE_CMD pull && $COMPOSE_CMD up -d"
    echo ""
    
    # Demander si on ouvre le navigateur
    if command_exists xdg-open || command_exists open; then
        echo -n "Ouvrir l'application dans le navigateur? (O/n): "
        read -r open_browser
        if [[ $open_browser != "n" && $open_browser != "N" ]]; then
            if command_exists xdg-open; then
                xdg-open http://localhost:3000 >/dev/null 2>&1 &
            elif command_exists open; then
                open http://localhost:3000
            fi
        fi
    fi
    
else
    echo "❌ Erreur lors du démarrage"
    echo "Consultez les logs avec: $COMPOSE_CMD logs"
    exit 1
fi