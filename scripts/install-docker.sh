#!/bin/bash
# OpenFamily - Installation Docker automatique (mode serveur)
# Usage: curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-docker.sh | bash

set -e

echo "=========================================="
echo "  Installation d'OpenFamily (Serveur)    "
echo "=========================================="
echo ""

# Vérifier Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé."
    echo ""
    read -p "Voulez-vous installer Docker maintenant ? (o/N): " INSTALL_DOCKER
    if [[ $INSTALL_DOCKER =~ ^[Oo]$ ]]; then
        echo "📦 Installation de Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
        usermod -aG docker $USER
        echo "✅ Docker installé. Veuillez vous déconnecter et reconnecter pour appliquer les permissions."
        exit 0
    else
        echo "❌ Docker est requis pour l'installation serveur."
        exit 1
    fi
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installation de docker-compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo "✅ Docker $(docker --version) détecté"
echo "✅ docker-compose $(docker-compose --version) détecté"
echo ""

# Demander le répertoire d'installation
read -p "Répertoire d'installation [/opt/openfamily]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/openfamily}

# Créer le répertoire
sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "📥 Téléchargement d'OpenFamily..."
sudo git clone https://github.com/NexaFlowFrance/OpenFamily.git .

# Configuration
echo ""
echo "🔧 Configuration..."
echo ""

# Générer un mot de passe sécurisé
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Demander le domaine
read -p "Nom de domaine (ex: openfamily.example.com) [localhost]: " DOMAIN
DOMAIN=${DOMAIN:-localhost}

# Demander le port
read -p "Port HTTP [3000]: " PORT
PORT=${PORT:-3000}

# Créer le fichier .env
sudo tee .env > /dev/null <<EOF
# OpenFamily Configuration
NODE_ENV=production
PORT=$PORT

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=openfamily
DB_USER=openfamily
DB_PASSWORD=$DB_PASSWORD

# Security
SESSION_SECRET=$(openssl rand -base64 32)

# Domain
DOMAIN=$DOMAIN
EOF

echo "✅ Fichier .env créé"
echo ""

# Démarrer les services
echo "🚀 Démarrage des services..."
sudo docker-compose up -d

echo ""
echo "✅ Installation terminée !"
echo ""
echo "🔐 Informations de connexion :"
echo "   URL: http://$DOMAIN:$PORT"
echo "   Base de données: $DB_PASSWORD"
echo ""
echo "📝 Fichier .env sauvegardé dans $INSTALL_DIR/.env"
echo ""
echo "Commandes utiles :"
echo "  - Voir les logs: sudo docker-compose logs -f"
echo "  - Arrêter: sudo docker-compose down"
echo "  - Redémarrer: sudo docker-compose restart"
echo ""

if [ "$DOMAIN" != "localhost" ]; then
    echo "⚠️  N'oubliez pas de configurer votre DNS pour pointer vers ce serveur !"
    echo ""
    echo "Pour HTTPS avec Let's Encrypt, utilisez :"
    echo "  sudo apt install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d $DOMAIN"
fi
