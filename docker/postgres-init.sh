#!/bin/bash
# Script d'initialisation PostgreSQL avec mot de passe automatique

echo "🔐 Configuration PostgreSQL avec mot de passe automatique..."

if [ -f /shared/.db_password ]; then
    DB_PASSWORD=$(head -n1 /shared/.db_password)
    echo "✅ Mot de passe lu depuis le fichier partagé"
    
    # Définir le mot de passe pour PostgreSQL
    export POSTGRES_PASSWORD="$DB_PASSWORD"
    
    echo "✅ PostgreSQL configuré avec mot de passe automatique"
else
    echo "❌ Erreur: Fichier de mot de passe non trouvé"
    exit 1
fi