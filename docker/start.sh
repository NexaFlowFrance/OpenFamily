#!/bin/bash
# Script de démarrage automatique avec génération de mot de passe sécurisé

echo "🚀 Initialisation OpenFamily..."

# Vérifier si le mot de passe existe déjà
if [ ! -f "/app/.password_generated" ]; then
    echo ""
    echo "🔐 Génération du mot de passe sécurisé..."
    
    # Générer un mot de passe sécurisé SHA-256
    TIMESTAMP=$(date +%s)
    RANDOM_STRING=$(openssl rand -base64 32)
    COMBINED="${TIMESTAMP}-${RANDOM_STRING}"
    SECURE_PASSWORD="OF_$(echo -n "$COMBINED" | sha256sum | cut -c1-24 | tr '+/' 'XY')"
    
    # Afficher le mot de passe de façon visible
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    🔑 MOT DE PASSE GÉNÉRÉ                    ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║                                                              ║"
    echo "║   NOTEZ BIEN CE MOT DE PASSE:                               ║"
    echo "║                                                              ║"
    echo "║   $SECURE_PASSWORD                           ║"
    echo "║                                                              ║"
    echo "║   ⚠️  SAUVEGARDEZ-LE MAINTENANT !                           ║"
    echo "║   Ce mot de passe sera nécessaire pour l'administration     ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Sauvegarder la génération
    echo "Mot de passe généré le: $(date)" > /app/.password_generated
    echo "Mot de passe: $SECURE_PASSWORD" >> /app/.password_generated
    
    # Attendre 10 secondes pour laisser le temps de noter
    echo "⏳ Démarrage dans 10 secondes (temps de noter le mot de passe)..."
    sleep 10
    
    # Exporter le mot de passe pour l'application
    export DATABASE_URL="postgresql://openfamily:${SECURE_PASSWORD}@postgres:5432/openfamily"
else
    echo "✅ Mot de passe existant détecté"
    # Lire le mot de passe existant
    SECURE_PASSWORD=$(grep "Mot de passe:" /app/.password_generated | cut -d' ' -f3)
    export DATABASE_URL="postgresql://openfamily:${SECURE_PASSWORD}@postgres:5432/openfamily"
fi

# Start nginx in background
nginx

# Démarrage du serveur Node.js avec mot de passe automatique
echo "🚀 Démarrage du serveur OpenFamily..."
exec node /app/dist/index.js
