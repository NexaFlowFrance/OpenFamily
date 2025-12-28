# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)

**Application 100% locale et open source pour gérer la vie de famille**

🇫🇷 Français | [🇬🇧 English](README.en.md) | [🇩🇪 Deutsch](README.de.md) | [🇪🇸 Español](README.es.md)

[Fonctionnalités](#-fonctionnalités) •
[Installation](#-installation) •
[Documentation](#-documentation) •
[Contribuer](#-contribuer) •
[Licence](#-licence)

</div>

---

## 📖 Table des matières

- [À propos](#-à-propos)
- [Caractéristiques](#-caractéristiques)
- [Fonctionnalités](#-fonctionnalités)
- [Démarrage rapide](#-démarrage-rapide)
- [Installation](#-installation)
- [Stockage des données](#-stockage-des-données)
- [Fonctionnalités avancées](#-fonctionnalités-avancées)
- [Technologies](#️-technologies)
- [Compatibilité](#-compatibilité)
- [Vie privée](#-vie-privée)
- [FAQ](#-faq)
- [Licence](#-licence)
- [Contribuer](#-contribuer)

---

## 🎯 À propos

OpenFamily est une application de gestion familiale complète proposée en open source par [NexaFlow](http://nexaflow.fr), conçue pour être auto-hébergée. Gardez le contrôle total de vos données en hébergeant l'application sur votre propre serveur. Gérez vos courses, tâches, rendez-vous, recettes, planning des repas et budget familial en toute sécurité, accessible depuis tous vos appareils.

**Version 1.0.3 - Architecture serveur uniquement**  
Cette version supprime complètement le mode localStorage au profit d'une architecture serveur centralisée avec PostgreSQL, garantissant une synchronisation fiable entre tous les appareils de la famille.

## 🚀 Caractéristiques

- ✅ **100% Auto-hébergé** - Vos données sur votre propre serveur, aucun service tiers
- 📱 **PWA** - Installez l'app comme une application native sur mobile/tablette
- 🔒 **Privé** - Vos données restent sur votre serveur, jamais sur des serveurs tiers
- 🔄 **Synchronisé** - Accédez à vos données depuis tous vos appareils
- 🆓 **Open Source** - Code source libre et modifiable
- 🌍 **Multi-langue** - Interface disponible en Français, Anglais, Allemand et Espagnol
- 🌙 **Thème sombre** - Mode clair et sombre disponibles
- 💡 **Liste intelligente** - Suggestions d'ingrédients basées sur vos repas planifiés
- 👨‍👩‍👧‍👦 **Multi-utilisateurs** - Gestion de toute la famille avec informations de santé

## 📋 Fonctionnalités

### 🛒 Liste de courses
- Catégorisation automatique (Bébé, Alimentation, Ménage, Santé, Autre)
- Prix et quantités
- Suggestions intelligentes basées sur les recettes planifiées
- Export/Import des listes
- **📋 Templates de listes** - Sauvegardez et réutilisez vos listes récurrentes
- **📱 Scan de codes-barres** - Ajoutez des articles en scannant (mobile uniquement)

### ✅ Tâches et listes
- Tâches récurrentes (quotidiennes, hebdomadaires, mensuelles, annuelles)
- Assignation aux membres de la famille
- Notes et priorités
- Vue calendrier intégrée
- **📊 Historique et statistiques** - Taux de complétion, tendances hebdomadaires

### 📅 Rendez-vous
- Calendrier mensuel avec vue française
- Intégration des tâches et rendez-vous
- Rappels et notes
- Code couleur par membre de la famille
- **🔔 Notifications automatiques** - Rappels 30min et 1h avant chaque rendez-vous

### 🍳 Recettes
- Bibliothèque de recettes familiales
- Catégories (Entrée, Plat, Dessert, Snack)
- Temps de préparation et cuisson
- Portions et tags
- **🔍 Filtres avancés** - Par catégorie, temps de préparation, difficulté

### 🍽️ Planning des repas
- Vue hebdomadaire (Lundi-Dimanche)
- 4 types de repas par jour (Petit-déjeuner, Déjeuner, Dîner, Snack)
- Liaison automatique avec les recettes
- Export du planning
- **📄 Export PDF** - Imprimez votre planning hebdomadaire

### 💰 Budget familial
- Suivi mensuel des dépenses
- 6 catégories : Alimentation, Santé, Enfants, Maison, Loisirs, Autre
- Définition de budgets par catégorie
- Graphiques de progression
- Alertes de dépassement
- **📊 Statistiques avancées** - Évolution sur 6 mois, répartition par catégorie

### 👨‍👩‍👧‍👦 Gestion familiale
- Profils pour chaque membre
- Informations de santé (groupe sanguin, allergies, vaccins)
- Contact d'urgence
- Notes médicales
- Code couleur personnalisé

---

## 🚀 Démarrage rapide

### ⚡ Installation automatique avec Docker

```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-docker.sh | bash
```

Ce script va :
- Installer Docker et Docker Compose (si nécessaire)
- Cloner le dépôt OpenFamily
- Configurer PostgreSQL
- Démarrer l'application sur le port 3000

---

## 📦 Installation

### Prérequis

- **Serveur Linux** (Ubuntu 20.04+ recommandé) ou Windows avec WSL
- **Docker & Docker Compose** (installés automatiquement par le script)
- **2 Go de RAM minimum**
- **10 Go d'espace disque**

### Installation manuelle

```bash
# 1. Cloner le repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# 2. Créer le fichier .env
cp .env.example .env

# 3. Modifier le mot de passe PostgreSQL dans .env
nano .env  # Changez DB_PASSWORD

# 4. Lancer avec Docker Compose
docker-compose up -d

# 5. Accéder à l'application
# http://localhost:3000 (local)
# http://votre-ip:3000 (réseau local)
# https://votre-domaine.com (avec reverse proxy)
```

### Configuration réseau

#### Accès local uniquement
L'application fonctionne immédiatement sur `http://localhost:3000`

#### Accès réseau local (LAN)
1. Trouvez l'IP de votre serveur : `ip addr show` ou `ipconfig`
2. Accédez depuis n'importe quel appareil : `http://192.168.X.X:3000`
3. **Détection automatique** : L'application détecte qu'elle est hébergée et active le mode serveur

#### Accès internet (optionnel)
Consultez le [Guide de Déploiement](docs/DEPLOYMENT.md) pour :
- Configurer un nom de domaine
- Installer un certificat SSL (HTTPS)
- Sécuriser l'accès avec authentification

### Pour les développeurs

```bash
# Installer les dépendances
pnpm install

# Démarrer PostgreSQL en local
docker-compose up -d postgres

# Lancer en mode développement
pnpm dev

# Build pour production
pnpm build

# Démarrer le serveur de production
pnpm start
```

**Note** : Le mode développement (`pnpm dev`) nécessite PostgreSQL. Utilisez Docker Compose pour démarrer uniquement la base de données.

### Pour les utilisateurs

#### Option 1: PWA (Recommandé)
1. Accédez à votre instance OpenFamily (ex: `http://192.168.1.100:3000`)
2. Sur mobile : cliquez sur "Ajouter à l'écran d'accueil"
3. Sur desktop : cliquez sur l'icône d'installation dans la barre d'adresse
4. L'application s'installera comme une app native

#### Option 2: Applications natives mobiles
- **Android** : Installez l'APK disponible dans les releases
- **iOS** : Utilisez TestFlight ou compilez depuis le code source

#### Option 3: Navigateur web
Accédez simplement à l'URL de votre serveur OpenFamily depuis n'importe quel navigateur moderne (Chrome, Safari, Firefox, Edge).

## 💾 Stockage des données

OpenFamily utilise une architecture **serveur centralisée avec PostgreSQL** :

### 🗄️ Architecture

- **Base de données** : PostgreSQL (inclus dans Docker Compose)
- **Serveur API** : Express.js (Node.js)
- **Synchronisation** : Temps réel via API REST
- **Sécurité** : Token d'authentification, isolation par famille

### 📊 Données stockées

Toutes les données sont stockées dans PostgreSQL :
- `shopping_items` - Liste de courses
- `tasks` - Tâches et emploi du temps
- `appointments` - Rendez-vous
- `family_members` - Membres de la famille (avec infos santé)
- `recipes` - Recettes
- `meals` - Planning des repas
- `budgets` - Budgets mensuels
- `families` - Configuration des familles

### 🔄 Synchronisation automatique

- ✅ **Multi-appareils** : Accédez depuis PC, tablette, smartphone
- ✅ **Temps réel** : Les modifications sont instantanées
- ✅ **Détection automatique** : L'app détecte le serveur sur le réseau
- ✅ **Famille par défaut** : Configuration initiale automatique

### 💾 Sauvegarde

Les données PostgreSQL sont persistées via Docker volumes :

```bash
# Sauvegarder manuellement
docker exec openfamily-db pg_dump -U openfamily openfamily > backup.sql

# Restaurer depuis une sauvegarde
docker exec -i openfamily-db psql -U openfamily openfamily < backup.sql
```

**Recommandation** : Configurez des sauvegardes automatiques quotidiennes avec cron ou un outil de backup PostgreSQL.

## ✨ Fonctionnalités avancées

### 🔔 Notifications intelligentes
- Rappels automatiques 30 minutes et 1 heure avant chaque rendez-vous
- Rappels 15 minutes et à l'heure exacte pour les tâches avec échéance
- Support des notifications navigateur (permission requise)

### 💡 Liste de courses intelligente
- Suggestions automatiques d'ingrédients basées sur vos repas planifiés
- Analyse des recettes de la semaine à venir
- Ajout en un clic depuis les suggestions

### 📊 Statistiques et tableau de bord
- Vue d'ensemble de toutes vos activités
- Taux de complétion des tâches (global et hebdomadaire)
- Utilisation du budget en temps réel avec graphiques d'évolution
- Tendances de planification des repas
- Graphiques et indicateurs visuels

### 🎯 Planification automatique des repas
- Génération automatique d'un planning hebdomadaire
- Sélection intelligente basée sur les catégories de recettes
- Évite les répétitions sur plusieurs jours
- Intégration avec vos recettes existantes

### 🔍 Recherche globale
- Recherche instantanée dans toutes vos données (Ctrl/Cmd+K)
- Résultats groupés par catégorie : courses, tâches, rendez-vous, recettes, repas
- Navigation rapide vers n'importe quelle page

### 🚀 Actions rapides
- Widgets sur la page d'accueil pour créer rapidement tâches et articles
- Ajout via formulaires inline avec support clavier (touche Entrée)
- Accès direct aux fonctionnalités principales

### 🌙 Thème automatique
- Mode clair, sombre ou automatique
- Détection automatique des préférences système
- Cycle entre les 3 modes d'un simple clic

### 💾 Import/Export de données
- Export complet au format JSON avec versioning
- Import de sauvegarde avec confirmation
- Sauvegarde manuelle ou automatique de toutes vos données

### ⚡ Ajout rapide
- Bouton flottant accessible depuis toute l'application
- Ajout express de tâches ou d'articles de courses
- Interface minimale pour une saisie rapide

### 🩺 Suivi de santé familial
- Groupe sanguin pour chaque membre
- Liste d'allergies
- Historique de vaccinations avec dates et rappels
- Notes médicales personnelles
- Contact d'urgence (nom, téléphone, relation)

## 🛠️ Technologies

### Frontend
- **React 19 + TypeScript** - Interface utilisateur moderne et typée
- **Vite 7** - Build tool ultra-rapide
- **TailwindCSS + shadcn/ui** - Design system élégant et cohérent
- **Wouter** - Routage léger
- **date-fns** - Manipulation des dates
- **Recharts** - Graphiques et visualisations

### Backend (Mode Serveur)
- **Node.js 20+ + Express** - API REST
- **PostgreSQL 16** - Base de données relationnelle
- **TypeScript** - Typage du backend
- **Docker + Docker Compose** - Conteneurisation et déploiement

### Stockage
- **localStorage** - Mode local (navigateur)
- **PostgreSQL** - Mode serveur (auto-hébergé)
- **Repository Pattern** - Abstraction du stockage pour les deux modes

### Mobile
- **Capacitor** - Build Android/iOS
- **Service Worker** - Mode offline (PWA)

## 📱 Compatibilité

- Chrome/Edge (desktop & mobile)
- Safari (iOS & macOS)
- Firefox
- Tout navigateur moderne supportant localStorage et Service Workers

## 🔐 Vie privée

Cette application respecte votre vie privée selon le mode choisi :

### Mode Local
- ❌ N'envoie **aucune donnée** à des serveurs externes
- ❌ N'utilise **aucune base de données** centralisée
- ❌ Ne nécessite **aucun compte utilisateur**
- ✅ Stocke **tout localement** sur votre appareil
- ✅ Fonctionne **entièrement hors ligne**

### Mode Serveur
- ✅ **Vous contrôlez l'infrastructure** - Hébergez sur votre propre serveur
- ✅ **Aucun tiers impliqué** - Pas de cloud externe
- ✅ **Chiffrement en transit** - HTTPS recommandé
- ✅ **Open Source** - Code vérifiable et auditable
- 📝 **Responsabilité** - Vous gérez la sécurité de votre serveur

---

## ❓ FAQ

### Mes données sont-elles sécurisées ?
**Mode Local** : Oui, toutes vos données sont stockées localement dans votre navigateur. Elles ne quittent jamais votre appareil.

**Mode Serveur** : Vos données sont stockées sur votre propre serveur. Vous avez le contrôle total et la responsabilité de la sécurité.

### Puis-je utiliser l'application hors ligne ?
**Mode Local** : Absolument ! Une fois installée comme PWA, l'application fonctionne entièrement hors ligne.

**Mode Serveur** : Une connexion au serveur est nécessaire pour synchroniser les données. Les fonctionnalités offline peuvent être limitées.

### Comment sauvegarder mes données ?
**Mode Local** : Allez dans Paramètres → Sauvegarde pour télécharger un fichier JSON contenant toutes vos données.

**Mode Serveur** : Configurez des sauvegardes automatiques de votre base de données PostgreSQL (voir [DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### L'application est-elle disponible en plusieurs langues ?
Oui ! L'interface est disponible en **Français 🇫🇷**, **Anglais 🇬🇧**, **Allemand 🇩🇪** et **Espagnol 🇪🇸**. Vous pouvez changer la langue lors de la configuration initiale ou dans les Paramètres.

### L'application fonctionne-t-elle sur iOS ?
Oui, vous pouvez l'installer comme PWA depuis Safari. Sur Android, vous pouvez également installer l'APK.

### Puis-je synchroniser entre plusieurs appareils ?
**Mode Local** : Utilisez la fonction d'export/import pour transférer manuellement vos données.

**Mode Serveur** : Oui ! Le mode serveur auto-hébergé permet la synchronisation automatique entre tous les appareils de la famille.

### L'application est-elle vraiment gratuite ?
Oui, 100% gratuite et open source. Aucun frais caché, aucun abonnement.

---

## 📄 Licence

AGPL-3.0 avec clause non-commerciale - Le projet est open source et forkable, mais l'utilisation commerciale nécessite une autorisation explicite. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à :
- Ouvrir des issues pour signaler des bugs
- Proposer des améliorations
- Soumettre des pull requests

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour les directives de contribution.

## 📚 Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Architecture technique et pattern Repository
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Guide de déploiement serveur (Docker, PostgreSQL, Nginx)
- [CONTRIBUTING.md](CONTRIBUTING.md) - Guide de contribution
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Code de conduite
- [CHANGELOG.md](CHANGELOG.md) - Historique des versions
