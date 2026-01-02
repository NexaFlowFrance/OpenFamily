# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

**100% lokale und Open-Source-Anwendung für Familienverwaltung**

[🇫🇷 Français](README.md) | [🇬🇧 English](README.en.md) | 🇩🇪 Deutsch | [🇪🇸 Español](README.es.md)

[Funktionen](#-funktionen) •
[Installation](#-installation) •
[Dokumentation](#-dokumentation) •
[Mitwirken](#-mitwirken) •
[Lizenz](#-lizenz)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-nexaflow%2Fopenfamily-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/nexaflow/openfamily)
[![GitHub](https://img.shields.io/badge/GitHub-NexaFlowFrance%2FOpenFamily-181717?logo=github&logoColor=white)](https://github.com/NexaFlowFrance/OpenFamily)

</div>

---

## 📖 Inhaltsverzeichnis

- [Über](#-über)
- [Eigenschaften](#-eigenschaften)
- [Funktionen](#-funktionen)
- [Schnellstart](#-schnellstart)
- [Installation](#-installation)
- [Datenspeicherung](#-datenspeicherung)
- [Erweiterte Funktionen](#-erweiterte-funktionen)
- [Technologien](#️-technologien)
- [Kompatibilität](#-kompatibilität)
- [Datenschutz](#-datenschutz)
- [FAQ](#-faq)
- [Lizenz](#-lizenz)
- [Mitwirken](#-mitwirken)

---

## 🎯 Über

OpenFamily ist eine umfassende Familienverwaltungsanwendung, die als Open Source von [NexaFlow](http://nexaflow.fr) angeboten wird und für Selbst-Hosting konzipiert ist. Behalten Sie die vollständige Kontrolle über Ihre Daten, indem Sie die Anwendung auf Ihrem eigenen Server hosten. Verwalten Sie Ihre Einkaufslisten, Aufgaben, Termine, Rezepte, Essensplanung und Familienbudget sicher, zugänglich von allen Ihren Geräten.

## 🚀 Eigenschaften

- ✅ **100% Selbst-gehostet** - Ihre Daten auf Ihrem eigenen Server, keine Drittanbieter
- 📱 **PWA** - Installieren Sie die App als native Anwendung auf Mobil/Tablet
- 🔒 **Privat** - Ihre Daten bleiben auf Ihrem Server, nie auf Servern Dritter
- 🔄 **Synchronisiert** - Greifen Sie von allen Ihren Geräten auf Ihre Daten zu
- 🆓 **Open Source** - Freier und modifizierbarer Quellcode
- 🌍 **Mehrsprachig** - Oberfläche verfügbar auf Französisch, Englisch, Deutsch und Spanisch
- 🌙 **Dunkles Design** - Helle und dunkle Modi verfügbar
- 💡 **Intelligente Liste** - Zutatvorschläge basierend auf Ihren geplanten Mahlzeiten
- 👨‍👩‍👧‍👦 **Mehrbenutzer** - Verwalten Sie die ganze Familie mit Gesundheitsinformationen

## 📋 Funktionen

### 🛒 Einkaufsliste
- Automatische Kategorisierung (Baby, Lebensmittel, Haushalt, Gesundheit, Sonstiges)
- Preise und Mengen
- Intelligente Vorschläge basierend auf geplanten Rezepten
- **📋 Listen-Vorlagen** - Speichern und wiederverwenden Sie wiederkehrende Listen

### ✅ Aufgaben und Listen
- Wiederkehrende Aufgaben (täglich, wöchentlich, monatlich, jährlich)
- Zuweisung an Familienmitglieder
- Notizen und Prioritäten
- Integrierte Kalenderansicht
- **📊 Verlauf und Statistiken** - Abschlussrate, wöchentliche Trends

### 📅 Termine
- Monatskalender mit französischer Ansicht
- Integration von Aufgaben und Terminen
- Erinnerungen und Notizen
- Farbcodierung nach Familienmitglied
- **🔔 Automatische Benachrichtigungen** - Erinnerungen 30 Min. und 1 Std. vor jedem Termin

### 🍳 Rezepte
- Familienrezeptbibliothek
- Kategorien (Vorspeise, Hauptgericht, Dessert, Snack)
- Zubereitungs- und Kochzeit
- Portionen und Tags
- **🔍 Erweiterte Filter** - Nach Kategorie, Zubereitungszeit, Schwierigkeit

### 🍽️ Essensplanung
- Wochenansicht (Montag-Sonntag)
- 4 Mahlzeitentypen pro Tag (Frühstück, Mittagessen, Abendessen, Snack)
- Automatische Verknüpfung mit Rezepten
- Planungsexport
- **📄 PDF-Export** - Drucken Sie Ihren wöchentlichen Essensplan

### 💰 Familienbudget
- Monatliche Ausgabenverfolgung
- 6 Kategorien: Lebensmittel, Gesundheit, Kinder, Haus, Freizeit, Sonstiges
- Budgetdefinition pro Kategorie
- Fortschrittsdiagramme
- Überschreitungswarnungen
- **📊 Erweiterte Statistiken** - 6-Monats-Trends, Kategorieaufschlüsselung

### 👨‍👩‍👧‍👦 Familienverwaltung
- Profile für jedes Mitglied
- Gesundheitsinformationen (Blutgruppe, Allergien, Impfungen)
- Notfallkontakt
- Medizinische Notizen
- Benutzerdefinierte Farbcodierung

---

## 🚀 Schnellstart

### Option 1: Docker (Empfohlen) ⭐

Die einfachste Methode! Verwenden Sie unser vorkonfiguriertes Docker-Image:

```bash
# 1. Laden Sie die Konfigurationsdateien herunter
mkdir openfamily && cd openfamily
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example
cp .env.example .env

# 2. Ändern Sie das Passwort (optional)
nano .env  # Ändern Sie DB_PASSWORD

# 3. Starten Sie OpenFamily
docker compose up -d

# 4. Greifen Sie auf die Anwendung zu
# http://localhost:3000
```

**Das war's!** 🎉 Die Anwendung und Datenbank werden automatisch konfiguriert.

### Option 2: Manuelle Installation

Für Entwickler oder wenn Sie Docker nicht verwenden können:

```bash
# 1. Repository klonen
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# 2. PostgreSQL installieren (falls noch nicht installiert)
# Windows: https://www.postgresql.org/download/windows/
# Linux: sudo apt install postgresql
# macOS: brew install postgresql

# 3. Datenbank erstellen
psql -U postgres
CREATE DATABASE openfamily;
\q

# 4. Umgebung konfigurieren
cp .env.example .env
nano .env  # Passen Sie DATABASE_URL mit Ihren Anmeldedaten an

# 5. Installieren und starten
pnpm install
pnpm build
pnpm start
```
---

## 📦 Installation

### Voraussetzungen

#### Mit Docker (Empfohlen)
- **Docker Desktop** (Windows/Mac) oder **Docker Engine** (Linux)
- **2 GB RAM mindestens**
- **5 GB Festplattenspeicher**

#### Ohne Docker
- **Node.js 20+** und **pnpm**
- **PostgreSQL 14+**
- **2 GB RAM mindestens**
- **10 GB Festplattenspeicher**

### Detaillierte Installation

📖 **Vollständiger Leitfaden**: [FIRST_INSTALLATION.md](FIRST_INSTALLATION.md)

Das offizielle Docker-Image ist auf Docker Hub verfügbar: [nexaflow/openfamily](https://hub.docker.com/r/nexaflow/openfamily)

### Netzwerkkonfiguration

#### Nur lokaler Zugriff
Die Anwendung funktioniert sofort unter `http://localhost:3000`

#### LAN-Zugriff
1. Finden Sie die IP Ihres Servers: `ip addr show` (Linux) oder `ipconfig` (Windows)
2. Zugriff von jedem Gerät: `http://192.168.X.X:3000`
3. **Automatische Erkennung**: Die Anwendung erkennt, dass sie gehostet wird und aktiviert den Servermodus

#### Internet-Zugriff (optional)
Siehe [Bereitstellungshandbuch](PRODUCTION.md) für:
- Domain-Namen konfigurieren
- SSL-Zertifikat installieren (HTTPS)
- Zugriff sichern

### Update

#### Mit Docker
```bash
docker compose pull
docker compose up -d
```

#### Ohne Docker
```bash
git pull
pnpm install
pnpm build
pnpm start
```

#### Option 1: PWA (Empfohlen)
1. Greifen Sie auf Ihre OpenFamily-Instanz zu (z.B.: `http://192.168.1.100:3000`)
2. Auf Mobil: Klicken Sie auf "Zum Startbildschirm hinzufügen"
3. Auf Desktop: Klicken Sie auf das Installationsicon in der Adressleiste
4. Die Anwendung wird als native App installiert

#### Option 2: Native mobile Apps
- **Android**: Installieren Sie die APK aus den Releases
- **iOS**: Verwenden Sie TestFlight oder kompilieren Sie aus dem Quellcode

#### Option 3: Webbrowser
Greifen Sie einfach über jeden modernen Browser (Chrome, Safari, Firefox, Edge) auf die URL Ihres OpenFamily-Servers zu.

## 💾 Datenspeicherung

OpenFamily verwendet eine **zentralisierte Serverarchitektur mit PostgreSQL**:

### 🗄️ Architektur

- **Datenbank**: PostgreSQL (in Docker Compose enthalten)
- **API-Server**: Express.js (Node.js)
- **Synchronisation**: Echtzeit über REST API
- **Sicherheit**: Authentifikations-Token, Familienisolation

### 📊 Gespeicherte Daten

Alle Daten werden in PostgreSQL gespeichert:
- `shopping_items` - Einkaufsliste
- `tasks` - Aufgaben und Zeitpläne
- `appointments` - Termine
- `family_members` - Familienmitglieder (mit Gesundheitsinfos)
- `recipes` - Rezepte
- `meals` - Essensplanung
- `budgets` - Monatliche Budgets
- `families` - Familienkonfiguration

### 🔄 Automatische Synchronisation

- ✅ **Multi-Gerät**: Zugriff von PC, Tablet, Smartphone
- ✅ **Echtzeit**: Änderungen sind sofort sichtbar
- ✅ **Automatische Erkennung**: App erkennt Server im Netzwerk
- ✅ **Standard-Familie**: Automatische Erstkonfiguration

### 💾 Sicherung

PostgreSQL-Daten werden über Docker-Volumes persistiert:

```bash
# Manuelle Sicherung
docker exec openfamily-db pg_dump -U openfamily openfamily > backup.sql

# Aus Sicherung wiederherstellen
docker exec -i openfamily-db psql -U openfamily openfamily < backup.sql
```

**Empfehlung**: Richten Sie tägliche automatische Sicherungen mit cron oder einem PostgreSQL-Backup-Tool ein.

## ✨ Erweiterte Funktionen

### 🔔 Intelligente Benachrichtigungen
- Automatische Erinnerungen 30 Minuten und 1 Stunde vor jedem Termin
- Erinnerungen 15 Minuten und zur genauen Zeit für Aufgaben mit Fälligkeitsdatum
- Browser-Benachrichtigungsunterstützung (Berechtigung erforderlich)

### 💡 Intelligente Einkaufsliste
- Automatische Zutatvorschläge basierend auf Ihren geplanten Mahlzeiten
- Analyse der Rezepte der kommenden Woche
- Ein-Klick-Hinzufügung aus den Vorschlägen

### 📊 Statistiken und Dashboard
- Überblick über alle Ihre Aktivitäten
- Aufgabenabschlussrate (global und wöchentlich)
- Echtzeit-Budgetverwendung mit Trenddiagrammen
- Essensplanungs-Trends
- Diagramme und visuelle Indikatoren

### 🎯 Automatische Essensplanung
- Automatische Generierung eines Wochenplans
- Intelligente Auswahl basierend auf Rezeptkategorien
- Vermeidet Wiederholungen über mehrere Tage
- Integration mit Ihren bestehenden Rezepten

### 🔍 Globale Suche
- Sofortsuche in allen Ihren Daten (Strg/Cmd+K)
- Ergebnisse gruppiert nach Kategorie: Einkäufe, Aufgaben, Termine, Rezepte, Mahlzeiten
- Schnelle Navigation zu jeder Seite

### 🚀 Schnellaktionen
- Widgets auf der Startseite zum schnellen Erstellen von Aufgaben und Artikeln
- Inline-Formulare mit Tastaturunterstützung (Enter-Taste)
- Direkter Zugriff auf Hauptfunktionen

### 🌙 Automatisches Design
- Heller, dunkler oder automatischer Modus
- Automatische Erkennung von Systemeinstellungen
- Wechsel zwischen 3 Modi mit einem Klick

### 💾 Datenimport/-export
- Vollständiger JSON-Export mit Versionierung
- Backup-Import mit Bestätigung
- Manuelle oder automatische Sicherung aller Ihrer Daten

### ⚡ Schnelles Hinzufügen
- Schwebendes Button von überall in der Anwendung zugänglich
- Express-Hinzufügung von Aufgaben oder Einkaufsartikeln
- Minimale Oberfläche für schnelle Eingabe

### 🩺 Familiäre Gesundheitsverfolgung
- Blutgruppe für jedes Mitglied
- Allergieliste
- Impfhistorie mit Daten und Erinnerungen
- Persönliche medizinische Notizen
- Notfallkontakt (Name, Telefon, Beziehung)

## 🛠️ Technologien

### Frontend
- **React 19 + TypeScript** - Moderne und typisierte Benutzeroberfläche
- **Vite 7** - Ultra-schnelles Build-Tool
- **TailwindCSS + shadcn/ui** - Elegantes und kohärentes Design-System
- **Wouter** - Leichtgewichtiges Routing
- **date-fns** - Datumsmanipulation
- **Recharts** - Diagramme und Visualisierungen

### Backend (Servermodus)
- **Node.js 20+ + Express** - REST API
- **PostgreSQL 16** - Relationale Datenbank
- **TypeScript** - Backend-Typisierung
- **Docker + Docker Compose** - Containerisierung und Deployment

### Speicher
- **localStorage** - Lokaler Modus (Browser)
- **PostgreSQL** - Servermodus (selbst-gehostet)
- **Repository Pattern** - Speicherabstraktion für beide Modi

### Mobil
- **Capacitor** - Android/iOS Build
- **Service Worker** - Offline-Modus (PWA)

## 📱 Kompatibilität

- Chrome/Edge (Desktop & Mobil)
- Safari (iOS & macOS)
- Firefox
- Jeder moderne Browser mit localStorage- und Service Worker-Unterstützung

## 🔐 Datenschutz

Diese Anwendung respektiert Ihre Privatsphäre je nach gewähltem Modus:

### Lokaler Modus
- ❌ Sendet **keine Daten** an externe Server
- ❌ Verwendet **keine zentrale Datenbank**
- ❌ Benötigt **kein Benutzerkonto**
- ✅ Speichert **alles lokal** auf Ihrem Gerät
- ✅ Funktioniert **vollständig offline**

### Servermodus
- ✅ **Sie kontrollieren die Infrastruktur** - Hosten auf Ihrem eigenen Server
- ✅ **Keine Drittparteien beteiligt** - Keine externe Cloud
- ✅ **Verschlüsselung im Transit** - HTTPS empfohlen
- ✅ **Open Source** - Verifizierbarer und auditbarer Code
- 📝 **Verantwortung** - Sie verwalten die Sicherheit Ihres Servers

---

## ❓ FAQ

### Sind meine Daten sicher?
**Lokaler Modus**: Ja, alle Ihre Daten werden lokal in Ihrem Browser gespeichert. Sie verlassen nie Ihr Gerät.

**Servermodus**: Ihre Daten werden auf Ihrem eigenen Server gespeichert. Sie haben vollständige Kontrolle und Verantwortung für die Sicherheit.

### Kann ich die Anwendung offline verwenden?
**Lokaler Modus**: Absolut! Einmal als PWA installiert, funktioniert die Anwendung vollständig offline.

**Servermodus**: Eine Verbindung zum Server ist für die Datensynchronisation erforderlich. Offline-Funktionen können begrenzt sein.

### Wie sichere ich meine Daten?
**Lokaler Modus**: Gehen Sie zu Einstellungen → Sicherung, um eine JSON-Datei mit allen Ihren Daten herunterzuladen.

**Servermodus**: Richten Sie automatische Sicherungen Ihrer PostgreSQL-Datenbank ein (siehe [DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### Ist die Anwendung in mehreren Sprachen verfügbar?
Ja! Die Oberfläche ist verfügbar auf **Französisch 🇫🇷**, **Englisch 🇬🇧**, **Deutsch 🇩🇪** und **Spanisch 🇪🇸**. Sie können die Sprache bei der Erstkonfiguration oder in den Einstellungen ändern.

### Funktioniert die Anwendung auf iOS?
Ja, Sie können sie als PWA aus Safari installieren. Auf Android können Sie auch die APK installieren.

### Kann ich zwischen mehreren Geräten synchronisieren?
**Lokaler Modus**: Verwenden Sie die Export/Import-Funktion für manuellen Datentransfer.

**Servermodus**: Ja! Der selbst-gehostete Servermodus ermöglicht automatische Synchronisation zwischen allen Familiengeräten.

### Ist die Anwendung wirklich kostenlos?
Ja, 100% kostenlos und Open Source. Keine versteckten Kosten, keine Abonnements.

---

## 📄 Lizenz

AGPL-3.0 mit nicht-kommerzieller Klausel - Das Projekt ist Open Source und forkbar, aber die kommerzielle Nutzung erfordert eine ausdrückliche Genehmigung. Siehe die Datei [LICENSE](LICENSE) für weitere Details.

## 🤝 Mitwirken

Beiträge sind willkommen! Zögern Sie nicht:
- Issues zu öffnen, um Bugs zu melden
- Verbesserungen vorzuschlagen
- Pull Requests einzureichen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Beitragsrichtlinien.

## 📚 Dokumentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technische Architektur und Repository-Pattern
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Server-Bereitstellungshandbuch (Docker, PostgreSQL, Nginx)
- [CONTRIBUTING.md](CONTRIBUTING.md) - Beitragshandbuch
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Verhaltenskodex
- [CHANGELOG.md](CHANGELOG.md) - Versionshistorie

## 📚 Dokumentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technische Architektur
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Server-Bereitstellungsanleitung
- [CONTRIBUTING.md](CONTRIBUTING.md) - Beitragsleitfaden
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Verhaltenskodex
- [CHANGELOG.md](CHANGELOG.md) - Versionshistorie
