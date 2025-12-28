# OpenFamily

Application 100% locale et open source pour gérer la vie de famille : courses, tâches, rendez-vous, recettes, planning des repas et budget familial.

## 🚀 Caractéristiques

- ✅ **100% Local** - Aucun serveur central, toutes les données restent sur votre appareil
- 📱 **PWA** - Installez l'app comme une application native sur mobile/tablette
- 🔒 **Privé** - Vos données ne quittent jamais votre appareil
- 🌐 **Offline** - Fonctionne sans connexion internet
- 🆓 **Open Source** - Code source libre et modifiable
- 🌙 **Thème sombre** - Mode clair et sombre disponibles
- 💡 **Liste intelligente** - Suggestions d'ingrédients basées sur vos repas planifiés
- 👨‍👩‍👧‍👦 **Multi-utilisateurs** - Gestion de toute la famille avec informations de santé

## 📋 Fonctionnalités

### 🛒 Liste de courses
- Catégorisation automatique (Bébé, Alimentation, Ménage, Santé, Autre)
- Prix et quantités
- Suggestions intelligentes basées sur les recettes planifiées
- Export/Import des listes

### ✅ Tâches et listes
- Tâches récurrentes (quotidiennes, hebdomadaires, mensuelles, annuelles)
- Assignation aux membres de la famille
- Notes et priorités
- Vue calendrier intégrée

### 📅 Rendez-vous
- Calendrier mensuel avec vue française
- Intégration des tâches et rendez-vous
- Rappels et notes
- Code couleur par membre de la famille

### 🍳 Recettes
- Bibliothèque de recettes familiales
- Catégories (Entrée, Plat, Dessert, Snack)
- Temps de préparation et cuisson
- Portions et tags

### 🍽️ Planning des repas
- Vue hebdomadaire (Lundi-Dimanche)
- 4 types de repas par jour (Petit-déjeuner, Déjeuner, Dîner, Snack)
- Liaison automatique avec les recettes
- Export du planning

### 💰 Budget familial
- Suivi mensuel des dépenses
- 6 catégories : Alimentation, Santé, Enfants, Maison, Loisirs, Autre
- Définition de budgets par catégorie
- Graphiques de progression
- Alertes de dépassement

### 👨‍👩‍👧‍👦 Gestion familiale
- Profils pour chaque membre
- Informations de santé (groupe sanguin, allergies, vaccins)
- Contact d'urgence
- Notes médicales
- Code couleur personnalisé

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

Toutes les données sont stockées dans le **localStorage** de votre navigateur :
- `openfamily_shopping` - Liste de courses
- `openfamily_tasks` - Tâches et emploi du temps
- `openfamily_appointments` - Rendez-vous
- `openfamily_members` - Membres de la famille (avec infos santé)
- `openfamily_recipes` - Recettes
- `openfamily_meals` - Planning des repas
- `openfamily_budgets` - Budgets mensuels

### Sauvegarde et restauration

Depuis les **Paramètres** de l'application :
- 📥 **Télécharger une sauvegarde** : Export JSON complet de toutes vos données
- 📤 **Importer une sauvegarde** : Restaurer depuis un fichier JSON
- 🗑️ **Réinitialiser** : Effacer toutes les données (avec confirmation)

## ✨ Fonctionnalités avancées

### 🔔 Notifications intelligentes
- Rappels automatiques 30 minutes avant chaque rendez-vous
- Notification à l'heure exacte du rendez-vous
- Support des notifications navigateur (permission requise)

### 💡 Liste de courses intelligente
- Suggestions automatiques d'ingrédients basées sur vos repas planifiés
- Analyse des recettes de la semaine à venir
- Ajout en un clic depuis les suggestions

### 📊 Statistiques et tableau de bord
- Vue d'ensemble de toutes vos activités
- Taux de complétion des tâches (global et hebdomadaire)
- Utilisation du budget en temps réel
- Tendances de planification des repas
- Graphiques et indicateurs visuels

### 🎯 Planification automatique des repas
- Génération automatique d'un planning hebdomadaire
- Sélection intelligente basée sur les catégories de recettes
- Évite les répétitions sur plusieurs jours
- Intégration avec vos recettes existantes

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

- **React + TypeScript** - Interface utilisateur
- **Vite** - Build tool
- **TailwindCSS + shadcn/ui** - Design system
- **localStorage** - Stockage des données
- **Service Worker** - Mode offline (PWA)

## 📱 Compatibilité

- Chrome/Edge (desktop & mobile)
- Safari (iOS & macOS)
- Firefox
- Tout navigateur moderne supportant localStorage et Service Workers

## 🔐 Vie privée

Cette application :
- ❌ N'envoie **aucune donnée** à des serveurs externes
- ❌ N'utilise **aucune base de données** centralisée
- ❌ Ne nécessite **aucun compte utilisateur**
- ✅ Stocke **tout localement** sur votre appareil
- ✅ Fonctionne **entièrement hors ligne**

## 📄 Licence

AGPL-3.0 avec clause non-commerciale - Le projet est open source et forkable, mais l'utilisation commerciale nécessite une autorisation explicite. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à :
- Ouvrir des issues pour signaler des bugs
- Proposer des améliorations
- Soumettre des pull requests
