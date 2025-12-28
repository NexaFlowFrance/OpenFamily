#!/bin/bash
# OpenFamily - Installation locale automatique
# Usage: curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-local.sh | bash

set -e

echo "======================================"
echo "  Installation d'OpenFamily (Local)  "
echo "======================================"
echo ""

# Vérifier les prérequis
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé. Veuillez installer Node.js 20+ d'abord."
    echo "   https://nodejs.org/"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "📦 Installation de pnpm..."
    npm install -g pnpm
fi

# Vérifier la version de Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js $NODE_VERSION détecté. Version 20+ requise."
    exit 1
fi

echo "✅ Node.js $(node -v) détecté"
echo "✅ pnpm $(pnpm -v) détecté"
echo ""

# Demander le répertoire d'installation
read -p "Répertoire d'installation [./openfamily]: " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-./openfamily}

# Créer le répertoire
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "📥 Téléchargement d'OpenFamily..."
git clone https://github.com/NexaFlowFrance/OpenFamily.git .

echo "📦 Installation des dépendances..."
pnpm install

echo "🔨 Build de l'application..."
pnpm build

echo ""
echo "✅ Installation terminée !"
echo ""
echo "Pour démarrer OpenFamily :"
echo "  cd $INSTALL_DIR"
echo "  pnpm dev"
echo ""
echo "L'application sera disponible sur http://localhost:5173"
echo ""
