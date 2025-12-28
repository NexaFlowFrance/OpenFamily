# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)

**100% lokale und Open-Source-Anwendung für Familienverwaltung**

[🇫🇷 Français](README.md) | [🇬🇧 English](README.en.md) | 🇩🇪 Deutsch | [🇪🇸 Español](README.es.md)

[Funktionen](#-funktionen) •
[Installation](#-installation) •
[Dokumentation](#-dokumentation) •
[Mitwirken](#-mitwirken) •
[Lizenz](#-lizenz)

</div>

---

## 🎯 Über

OpenFamily ist eine umfassende Familienverwaltungsanwendung, die als Open Source von [NexaFlow](http://nexaflow.fr) angeboten wird und für Selbst-Hosting konzipiert ist. Behalten Sie die vollständige Kontrolle über Ihre Daten, indem Sie die Anwendung auf Ihrem eigenen Server hosten. Verwalten Sie Ihre Einkaufslisten, Aufgaben, Termine, Rezepte, Essensplanung und Familienbudget sicher, zugänglich von allen Ihren Geräten.

**Version 1.0.3 - Nur Server-Architektur**  
Diese Version entfernt den localStorage-Modus vollständig zugunsten einer zentralisierten Server-Architektur mit PostgreSQL, die eine zuverlässige Synchronisation über alle Familiengeräte hinweg gewährleistet.

## 🚀 Hauptmerkmale

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
- **📱 Barcode-Scannen** - Artikel per Scan hinzufügen (nur Mobil)

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

## ✨ Erweiterte Funktionen

### 🔔 Intelligente Benachrichtigungen
- Automatische Erinnerungen 30 Minuten und 1 Stunde vor jedem Termin
- Erinnerungen 15 Minuten vor und zur genauen Zeit für Aufgaben mit Fälligkeitsdatum
- Browser-Benachrichtigungsunterstützung (Berechtigung erforderlich)

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

## 🚀 Schnellstart

### Lokaler Modus (Ohne Server)

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
pnpm install
pnpm dev
# Öffnen Sie http://localhost:3000
```

### Server-Modus (Selbst-gehostet mit Docker)

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
cp .env.example .env
# Ändern Sie DB_PASSWORD in .env
docker-compose up -d
```

Siehe [DEPLOYMENT.md](docs/DEPLOYMENT.md) für weitere Details.

## 💾 Datenspeicherung

### 📱 Lokaler Modus
- ✅ 100% privat - Daten verlassen nie Ihr Gerät
- ✅ Funktioniert offline
- ⚠️ Keine Synchronisation

### 🔄 Server-Modus
- ✅ Familiensynchronisation
- ✅ Multi-Geräte-Zugriff
- ✅ Vollständige Kontrolle

## 🛠️ Technologien

- **Frontend**: React 19 + TypeScript + Vite 7 + TailwindCSS
- **Backend**: Node.js 20+ + Express + PostgreSQL 16
- **Mobile**: Capacitor + PWA

## 🔐 Datenschutz

**Lokaler Modus**: Keine Daten werden an externe Server gesendet.

**Server-Modus**: Sie kontrollieren die Infrastruktur auf Ihrem eigenen Server.

## ❓ FAQ

### Sind meine Daten sicher?
**Lokaler Modus**: Ja, alle Daten werden lokal in Ihrem Browser gespeichert.
**Server-Modus**: Ja, auf Ihrem eigenen Server mit voller Kontrolle.

### Ist die Anwendung in mehreren Sprachen verfügbar?
Ja! Verfügbar auf **Französisch 🇫🇷**, **Englisch 🇬🇧**, **Deutsch 🇩🇪** und **Spanisch 🇪🇸**.

### Kann ich zwischen mehreren Geräten synchronisieren?
**Lokaler Modus**: Verwenden Sie Export/Import für manuellen Transfer.
**Server-Modus**: Ja! Automatische Synchronisation zwischen allen Geräten.

## 📄 Lizenz

AGPL-3.0 mit nicht-kommerzieller Klausel. Siehe [LICENSE](LICENSE) für Details.

## 🤝 Mitwirken

Beiträge sind willkommen! Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## 📚 Dokumentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technische Architektur
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Server-Bereitstellungsanleitung
- [CONTRIBUTING.md](CONTRIBUTING.md) - Beitragsleitfaden
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Verhaltenskodex
- [CHANGELOG.md](CHANGELOG.md) - Versionshistorie

---

<div align="center">

Mit ❤️ gemacht von [NexaFlow](https://github.com/NexaFlowFrance)

[⬆ Zurück nach oben](#openfamily)

</div>
