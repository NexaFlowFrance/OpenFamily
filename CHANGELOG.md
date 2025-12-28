# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### À venir
- Synchronisation optionnelle via cloud personnel
- Mode multi-utilisateurs avec partage sécurisé
- Widget pour écran d'accueil
- Support multi-langues
- Export PDF des plannings et listes

---

## [1.0.0] - 2025-12-28

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
