# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### À venir
- Synchronisation optionnelle via cloud personnel
- Mode multi-utilisateurs avec partage sécurisé
- Widget pour écran d'accueil
- Export PDF des plannings et listes

---

## [1.0.2] - 2024-12-28

### 🚀 Architecture serveur intelligente

#### ✨ Ajouté
- **Détection automatique du serveur**
  - L'app détecte si elle est hébergée sur un serveur (pas localhost)
  - Configuration automatique de l'URL API
  - Identifiants par défaut pour simplification
  - Aucune configuration manuelle nécessaire en mode auto
  
- **Nouveau module `serverDetection.ts`**
  - `isHostedOnServer()`: Détection hébergement
  - `getApiUrl()`: Calcul automatique URL API
  - `checkServerAvailability()`: Vérification disponibilité
  - `shouldAutoConfigureServer()`: Détermination auto-config

#### 🐛 Corrigé
- **Configuration redemandée après suppression données navigateur**
  - Vérification serveur EN PRIORITÉ si mode auto-détecté
  - Récupération automatique config depuis PostgreSQL
  - Mise à jour automatique localStorage après vérification

- **Texte débordant des boutons de stockage**
  - Réduction tailles texte (text-base, text-xs)
  - Ajout `break-words` pour wrapping automatique
  - Icônes optimisées (w-6 h-6)
  - Padding réduit (p-4)
  - Alignement `items-start` pour mobile

- **Couleurs mal affichées en mode sombre**
  - Utilisation `text-foreground` au lieu couleurs fixes
  - Utilisation `text-muted-foreground` pour descriptions
  - Adaptation automatique au thème actif

#### 🎨 Améliorations UI
- Interface onboarding plus compacte et responsive
- Message de confirmation "Configuration automatique"
- Désactivation choix local/serveur si auto-détecté
- Masquage champs URL/token/familyId si auto-config

#### 🌍 Traductions
- Nouvelles clés i18n (FR/EN/DE/ES):
  - `onboarding.autoDetected`
  - `onboarding.serverAutoConfigured`
  - `onboarding.serverAutoConfiguredDesc`

#### 📋 Migration
- Mode serveur : Supprimer données navigateur sur tous appareils, reconfigurer une fois
- Mode local : Aucun changement requis

---

## [1.0.1] - 2024-12-28

### 🐛 Corrections de bugs critiques

#### Corrigé
- **Onboarding - Mode sombre non cliquable**
  - Ajout de `setTheme()` dans ThemeContext pour permettre la sélection directe du thème
  - Le bouton de sélection du thème sombre fonctionne maintenant correctement

- **Onboarding - Texte débordant des boutons**
  - Correction du layout des boutons de mode de stockage
  - Ajout de `flex-shrink-0` et `min-w-0` pour un wrapping correct du texte
  - Les descriptions ne débordent plus à droite des boutons

- **Onboarding - Configuration redemandée sur chaque appareil**
  - Implémentation d'une synchronisation serveur complète de la configuration
  - En mode serveur, la configuration est maintenant partagée entre tous les appareils
  - Nouvelle table PostgreSQL `family_configuration`
  - Nouveaux endpoints API GET/POST `/api/family/config`

#### ✨ Ajouté
- **Docker Hub automation**
  - Workflow GitHub Actions pour builds automatiques
  - Support multi-architecture (amd64, arm64)
  - Push automatique vers `nexaflow/openfamily`
  - BuildKit caching pour optimisation des builds

- **Utilitaire de synchronisation de configuration**
  - Nouveau module `configSync.ts` pour gestion localStorage/serveur
  - Vérification automatique du serveur en mode serveur
  - Backward compatible avec le mode local

#### 📋 Migration
- Pour les utilisateurs en mode serveur : exécuter le nouveau schema.sql pour créer la table `family_configuration`
- Mode local : aucune action requise

---

## [1.0.0] - 2024-12-28

### 🎉 Version initiale

#### ✨ Ajouté
- **Gestion des courses**
  - Liste de courses avec catégorisation automatique
  - Suggestions intelligentes basées sur les repas planifiés
  - Prix et quantités
  - Export/Import des listes

- **Gestion des tâches**
  - Tâches avec récurrence (quotidienne, hebdomadaire, mensuelle, annuelle)
  - Assignation aux membres de la famille
  - Notes et priorités
  - Vue calendrier intégrée

- **Gestion des rendez-vous**
  - Calendrier mensuel avec vue française
  - Notifications 30 minutes avant et à l'heure exacte
  - Code couleur par membre de la famille
  - Notes et rappels

- **Gestion des recettes**
  - Bibliothèque de recettes familiales
  - Catégories (Entrée, Plat, Dessert, Snack)
  - Temps de préparation et cuisson
  - Liste d'ingrédients et instructions

- **Planning des repas**
  - Vue hebdomadaire (Lundi-Dimanche)
  - 4 types de repas par jour
  - Génération automatique de planning
  - Liaison avec les recettes

- **Budget familial**
  - Suivi mensuel des dépenses
  - 6 catégories prédéfinies
  - Graphiques de progression
  - Alertes de dépassement

- **Gestion familiale**
  - Profils pour chaque membre
  - Informations de santé (groupe sanguin, allergies, vaccins)
  - Contact d'urgence
  - Notes médicales
  - Code couleur personnalisé

- **Fonctionnalités générales**
  - PWA avec support offline complet
  - Thème clair et sombre
  - Sauvegarde/Restauration des données (JSON)
  - 100% local, aucun serveur
  - Interface responsive (mobile, tablette, desktop)
  - Navigation par onglets
  - Bouton d'ajout rapide flottant

#### 🛠️ Technique
- Stack : React + TypeScript + Vite
- UI : TailwindCSS + shadcn/ui
- Stockage : localStorage
- Build mobile : Capacitor
- Service Worker pour mode offline

---

## Types de changements

- `Added` (Ajouté) pour les nouvelles fonctionnalités
- `Changed` (Modifié) pour les changements dans les fonctionnalités existantes
- `Deprecated` (Déprécié) pour les fonctionnalités qui seront bientôt supprimées
- `Removed` (Supprimé) pour les fonctionnalités supprimées
- `Fixed` (Corrigé) pour les corrections de bugs
- `Security` (Sécurité) pour les correctifs de vulnérabilités

[Unreleased]: https://github.com/NexaFlowFrance/OpenFamily/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/NexaFlowFrance/OpenFamily/releases/tag/v1.0.0
