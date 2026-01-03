# Installation PWA - OpenFamily

OpenFamily est une Progressive Web App (PWA) qui peut être installée sur n'importe quel appareil sans passer par les stores.

## 📱 Installation sur Android (Chrome/Edge)

1. Ouvrez OpenFamily dans Chrome ou Edge
2. Appuyez sur le menu (⋮) en haut à droite
3. Sélectionnez **"Ajouter à l'écran d'accueil"** ou **"Installer l'application"**
4. Confirmez l'installation
5. L'application apparaît sur votre écran d'accueil

**Alternative :**
- Une bannière peut apparaître automatiquement proposant l'installation
- Cliquez sur "Installer" dans la bannière

## 🍎 Installation sur iPhone/iPad (Safari)

1. Ouvrez OpenFamily dans Safari
2. Appuyez sur le bouton de partage (📤) en bas de l'écran
3. Faites défiler et sélectionnez **"Sur l'écran d'accueil"**
4. Donnez un nom à l'application (ou gardez "OpenFamily")
5. Appuyez sur **"Ajouter"**
6. L'application apparaît sur votre écran d'accueil

**Note :** Sur iOS, seul Safari supporte l'ajout à l'écran d'accueil pour les PWA.

## 💻 Installation sur Desktop (Chrome/Edge)

### Windows / macOS / Linux

1. Ouvrez OpenFamily dans Chrome ou Edge
2. Cliquez sur l'icône d'installation (➕) dans la barre d'adresse
   - Ou via le menu → "Installer OpenFamily..."
3. Confirmez l'installation
4. L'application s'ouvre dans une fenêtre dédiée

**Désinstaller :**
- Chrome : Menu → Plus d'outils → Désinstaller OpenFamily...
- Edge : Paramètres et plus → Applications → Gérer les applications

## 🔄 Mises à jour

Les PWA se mettent à jour automatiquement :
- Au prochain chargement de l'application
- Pas besoin de télécharger manuellement
- Toujours la dernière version disponible

Pour forcer une mise à jour :
1. Fermez complètement l'application
2. Rouvrez-la
3. La nouvelle version se charge automatiquement

## ✨ Avantages de la PWA

✅ **Pas de stores** - Installation directe depuis le navigateur  
✅ **Multi-plateforme** - Fonctionne sur tous les appareils  
✅ **Mises à jour auto** - Toujours à jour sans action requise  
✅ **Léger** - Pas de téléchargement lourd  
✅ **Offline** - Fonctionne sans connexion (après première visite)  
✅ **Sécurisé** - HTTPS obligatoire, sandboxé par le navigateur  

## 📷 Permissions

### Caméra (pour scanner codes-barres)

**Première utilisation :**
- Le navigateur demande automatiquement l'autorisation
- Cliquez/Appuyez sur "Autoriser"

**Si refusé par erreur :**

**Android (Chrome) :**
1. Paramètres du site (icône 🔒 dans la barre d'adresse)
2. Permissions → Caméra → Autoriser

**iOS (Safari) :**
1. Réglages iOS → Safari
2. Caméra → Demander ou Autoriser

**Desktop :**
1. Icône de caméra dans la barre d'adresse
2. Cliquez → Autoriser

### Notifications (pour rappels)

Même processus que pour la caméra - le navigateur demande automatiquement.

## 🌐 Accès depuis n'importe où

Vous pouvez aussi accéder à OpenFamily sans installation :
- Simplement ouvrir l'URL dans votre navigateur
- Marquer comme favori pour un accès rapide

## 🔧 Dépannage

### "Impossible d'installer"
- Vérifiez que vous utilisez un navigateur compatible (Chrome, Edge, Safari)
- Assurez-vous d'être sur HTTPS (pas HTTP)

### HTTPS local (certificat interne) : page bloquée / notifications impossibles
Si OpenFamily est accessible en HTTPS via un certificat **interne** (ex: Caddy `tls internal`), le navigateur peut bloquer l'accès tant que la **CA** n'est pas approuvée sur l'appareil.

- Il n'est pas possible d'"autoriser" une CA via une popup web : c'est volontairement bloqué par les navigateurs/OS (sécurité).
- Solution : installer/importer la CA sur chaque appareil (PC/mobile) comme Autorité de confiance, ou utiliser un domaine + certificat public (Let's Encrypt) pour une expérience sans manipulation côté utilisateurs.

### L'application ne fonctionne pas offline
- Visitez l'application au moins une fois avec connexion
- Les données se mettent en cache automatiquement

### L'icône ne s'affiche pas
- L'icône peut prendre quelques secondes à apparaître
- Rafraîchissez l'écran d'accueil

### Différences avec une app native
Les PWA ont quelques limitations par rapport aux apps natives :
- Pas d'accès aux fichiers système complets
- Certaines APIs avancées non disponibles
- Performance légèrement inférieure pour animations complexes

Mais pour OpenFamily, la PWA offre toutes les fonctionnalités nécessaires ! 🎉
