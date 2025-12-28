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

OpenFamily est une application de gestion familiale complète proposée en open source par [NexaFlow](http://nexaflow.fr), qui privilégie votre vie privée. Toutes vos données restent sur votre appareil, aucun serveur central, aucun compte requis. Gérez vos courses, tâches, rendez-vous, recettes, planning des repas et budget familial en toute sécurité.

## 🚀 Caractéristiques

- ✅ **100% Local ou Auto-hébergé** - Choisissez entre stockage local ou serveur auto-hébergé pour synchronisation familiale
- 📱 **PWA** - Installez l'app comme une application native sur mobile/tablette
- 🔒 **Privé** - Vos données ne quittent jamais votre appareil (mode local) ou restent sur votre serveur (mode serveur)
- 🌐 **Offline** - Fonctionne sans connexion internet en mode local
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

### ⚡ Installation en 1 ligne

#### Mode Local (Développement)
```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-local.sh | bash
```

#### Mode Serveur (Docker)
```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-docker.sh | bash
```

---

### Mode Local (Sans serveur)

```bash
# Cloner le repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git

# Installer les dépendances
cd OpenFamily
pnpm install

# Lancer en mode développement
pnpm dev

# Ouvrir http://localhost:3000
```

### Mode Serveur (Auto-hébergé avec Docker)

```bash
# Cloner le repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# Créer le fichier .env
cp .env.example .env
# Modifier DB_PASSWORD dans .env avec un mot de passe sécurisé

# Lancer avec Docker Compose
docker-compose up -d

# L'application sera disponible sur http://localhost:3000
```

Voir [DEPLOYMENT.md](docs/DEPLOYMENT.md) pour plus de détails sur le déploiement serveur.

---

## 📦 Installation

### Pour les développeurs

```bash
# Installer les dépendances
pnpm install

# Lancer en mode développement
pnpm dev

# Build pour production
pnpm build

# Build pour Android (APK)
pnpm cap:android

# Build pour iOS (IPA)
pnpm cap:ios
```

### Pour les utilisateurs

#### Option 1: PWA (Recommandé)
1. Ouvrez l'application dans votre navigateur (Chrome, Safari, Edge)
2. Sur mobile : cliquez sur "Ajouter à l'écran d'accueil"
3. Sur desktop : cliquez sur l'icône d'installation dans la barre d'adresse

#### Option 2: Applications natives
- **Android** : Téléchargez l'APK depuis les releases
- **iOS** : Installez via TestFlight ou un store alternatif

#### Option 3: Auto-hébergement
1. Clonez ce dépôt
2. Exécutez `pnpm install && pnpm build`
3. Hébergez le contenu du dossier `dist/public` sur n'importe quel serveur web statique
4. Ou utilisez simplement `pnpm start` pour un serveur local

#### Option 4: Fichier HTML local
1. Après le build, ouvrez simplement `dist/public/index.html` dans votre navigateur
2. L'application fonctionnera entièrement en local

## 💾 Stockage des données

OpenFamily propose **deux modes de stockage** que vous pouvez choisir lors de la configuration initiale :

### 📱 Mode Local (Par défaut)

Toutes les données sont stockées dans le **localStorage** de votre navigateur :
- ✅ **100% privé** - Les données ne quittent jamais votre appareil
- ✅ **Fonctionne offline** - Aucune connexion internet requise
- ✅ **Gratuit** - Aucun serveur à héberger
- ⚠️ **Pas de synchronisation** - Les données restent sur un seul appareil

Données stockées :
- `openfamily_shopping` - Liste de courses
- `openfamily_tasks` - Tâches et emploi du temps
- `openfamily_appointments` - Rendez-vous
- `openfamily_members` - Membres de la famille (avec infos santé)
- `openfamily_recipes` - Recettes
- `openfamily_meals` - Planning des repas
- `openfamily_budgets` - Budgets mensuels

### 🔄 Mode Serveur (Auto-hébergé)

Données stockées sur votre propre serveur avec PostgreSQL :
- ✅ **Synchronisation familiale** - Partagez les données avec toute la famille
- ✅ **Accès multi-appareils** - Utilisez l'app sur plusieurs appareils
- ✅ **Sauvegarde centralisée** - Toutes les données sur votre serveur
- ✅ **Contrôle total** - Vous gérez votre infrastructure
- 📝 **Configuration requise** - Serveur Linux, Docker, nom de domaine (optionnel)

Pour configurer le mode serveur, consultez le [Guide de Déploiement](docs/DEPLOYMENT.md).

### Sauvegarde et restauration (Mode Local)

Depuis les **Paramètres** de l'application :
- 📥 **Télécharger une sauvegarde** : Export JSON complet de toutes vos données
- 📤 **Importer une sauvegarde** : Restaurer depuis un fichier JSON
- 🗑️ **Réinitialiser** : Effacer toutes les données (avec confirmation)

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
