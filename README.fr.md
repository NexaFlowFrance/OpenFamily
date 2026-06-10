<div align="center">
  <img src="client/public/OpenFamily.png" alt="OpenFamily" width="90">
  <h1>OpenFamily</h1>
  <p><strong>Application de gestion familiale open source, auto-hébergeable</strong><br>
  Gardez le contrôle total de vos données — hébergez-la sur votre propre serveur.</p>

  🇬🇧 <a href="README.md">English</a> · 🇫🇷 <strong>Français</strong>

  [![Release](https://img.shields.io/github/v/release/NexaFlowFrance/OpenFamily?color=2563eb&label=version)](https://github.com/NexaFlowFrance/OpenFamily/releases/latest)
  [![CI](https://img.shields.io/github/actions/workflow/status/NexaFlowFrance/OpenFamily/ci.yml?branch=main&label=CI)](https://github.com/NexaFlowFrance/OpenFamily/actions/workflows/ci.yml)
  [![Démo](https://img.shields.io/badge/Démo-en%20ligne-DC4A60)](https://nexaflowfrance.github.io/OpenFamily/demo/)
  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL--v3-blue.svg)](licence.md)
</div>

---

> 🎬 **[Essayez la démo en ligne →](https://nexaflowfrance.github.io/OpenFamily/demo/)** — aucune inscription, rien n'est enregistré.

## 🎯 Fonctionnalités

| | |
|---|---|
| 🛒 **Liste de courses** | Catégorisation, prix, quantités, templates, **mode magasin par rayon** |
| ✅ **Tâches** | Tâches récurrentes, assignation familiale, statistiques |
| 📅 **Rendez-vous** | Calendrier mensuel, rappels automatiques, code couleur, **export iCal (.ics / webcal)** |
| 🗓️ **Planning hebdomadaire** | Horaires de travail et emploi du temps scolaire par membre |
| 🍳 **Recettes** | Bibliothèque familiale, filtres avancés, temps de préparation |
| 🍽️ **Planning repas** | Vue hebdomadaire, export PDF, liaison recettes |
| 💰 **Budget** | Suivi mensuel, **graphiques**, **plafonds par catégorie avec alertes** |
| 👨‍👩‍👧‍👦 **Famille** | Profils membres, informations santé, contacts d'urgence |
| 🔄 **Sync temps réel** | Mise à jour instantanée entre tous les appareils (WebSocket) |
| 🔔 **Notifications** | Rappels de rendez-vous, alertes tâches (Web Push VAPID) + in-app |
| 👥 **Comptes partagés** | Invitations par lien, demandes d'accès, transfert de propriété |
| 🛡️ **Rôles & permissions** | Comptes **parent / enfant** — budget en lecture seule pour les enfants |
| 🌍 **Bilingue** | Interface **français / anglais** avec détection automatique |
| 📴 **Mode hors ligne** | Consultation des données en cache sans connexion (PWA) |

## 🔗 Intégrations tierces

| Application | Type | Ce qui est synchronisé |
|---|---|---|
| **Mealie** | 🍲 Recettes | Import automatique des recettes (API v1 & v2) |
| **Tandoor** | 🌿 Recettes | Import via l'API Django REST |
| **Home Assistant** | 🏠 Courses | Sync liste de courses via WebSocket |
| **Grocy** | 🥦 Courses & stock | Synchronisation liste de courses et stock |
| **Nextcloud** | ☁️ Calendrier | Import CalDAV avec découverte automatique |

> 🎬 Merci à **[Makernix](https://www.youtube.com/@Makernix)** — c'est lors d'un échange direct avec lui que l'idée des intégrations tierces a émergé.

## 🚀 Démarrage rapide

### 🪟 Windows (.exe) — le plus simple

**NexaFlow** fournit un installeur graphique tout-en-un (Node.js et PostgreSQL embarqués, aucun Docker).

<p>
  <a href="https://github.com/NexaFlowFrance/OpenFamily/releases/latest/download/OpenFamily-Setup.exe">
    <img src="https://img.shields.io/badge/⬇️%20Télécharger-OpenFamily%20pour%20Windows-2496ED?style=for-the-badge&logo=windows&logoColor=white" alt="Télécharger" />
  </a>
</p>

### 🐳 Docker (recommandé pour serveur)

```bash
cp .env.example .env   # éditez vos paramètres
docker-compose up -d --build
```

- Frontend : http://localhost:3000 · Backend : http://localhost:3001

### 🛠️ Installation manuelle

```bash
npm run install:all
psql -U postgres -c "CREATE DATABASE openfamily;"
psql -U postgres -d openfamily -f server/schema.sql
cp .env.example .env
npm run dev
```

## 🛠️ Technologies

**Frontend** : React 19 · TypeScript · Vite 7 · TailwindCSS · Radix UI · i18next · PWA
**Backend** : Node 20 · Express · PostgreSQL 16 · WebSocket · Web Push (VAPID) · JWT + bcrypt
**DevOps** : Docker Compose · GitHub Actions (CI + publication ghcr.io)

## 🔐 Sécurité

JWT (7 j, refresh auto) · bcrypt (cost 12) · helmet · rate limiting · CORS strict · validation serveur.

## 🤝 Contribution

Les contributions sont les bienvenues — ouvrez une [issue](https://github.com/NexaFlowFrance/OpenFamily/issues) ou une [pull request](https://github.com/NexaFlowFrance/OpenFamily/pulls).

## 📄 Licence

GNU Affero General Public License v3.0 (AGPL-3.0-only) — voir [licence.md](licence.md).

## 🙏 Crédits

Développé et maintenu par [NexaFlow France](https://nexaflow.fr).
