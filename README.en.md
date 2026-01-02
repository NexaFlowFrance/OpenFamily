# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

**100% local and open source application for family life management**

[🇫🇷 Français](README.md) | 🇬🇧 English | [🇩🇪 Deutsch](README.de.md) | [🇪🇸 Español](README.es.md)

[Features](#-features) •
[Installation](#-installation) •
[Documentation](#-documentation) •
[Contributing](#-contributing) •
[License](#-license)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-nexaflow%2Fopenfamily-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/nexaflow/openfamily)
[![GitHub](https://img.shields.io/badge/GitHub-NexaFlowFrance%2FOpenFamily-181717?logo=github&logoColor=white)](https://github.com/NexaFlowFrance/OpenFamily)

</div>

---

## 📖 Table of Contents

- [About](#-about)
- [Key Features](#-key-features)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Data Storage](#-data-storage)
- [Advanced Features](#-advanced-features)
- [Technologies](#️-technologies)
- [Compatibility](#-compatibility)
- [Privacy](#-privacy)
- [FAQ](#-faq)
- [License](#-license)
- [Contributing](#-contributing)

---

## 🎯 About

OpenFamily is a comprehensive family management application offered as open source by [NexaFlow](http://nexaflow.fr), designed to be self-hosted. Keep total control of your data by hosting the application on your own server. Manage your shopping lists, tasks, appointments, recipes, meal planning, and family budget securely, accessible from all your devices.


## 🚀 Key Features

- ✅ **100% Self-Hosted** - Your data on your own server, no third-party services
- 📱 **PWA** - Install the app as a native application on mobile/tablet
- 🔒 **Private** - Your data stays on your server, never on third-party servers
- 🔄 **Synchronized** - Access your data from all your devices
- 🆓 **Open Source** - Free and modifiable source code
- 🌍 **Multi-language** - Interface available in French, English, German, and Spanish
- 🌙 **Dark theme** - Light and dark modes available
- 💡 **Smart list** - Ingredient suggestions based on your planned meals
- 👨‍👩‍👧‍👦 **Multi-user** - Manage the whole family with health information

## 📋 Features

### 🛒 Shopping List
- Automatic categorization (Baby, Food, Household, Health, Other)
- Prices and quantities
- Smart suggestions based on planned recipes
- **📋 List templates** - Save and reuse your recurring lists

### ✅ Tasks and Lists
- Recurring tasks (daily, weekly, monthly, annual)
- Assignment to family members
- Notes and priorities
- Integrated calendar view
- **📊 History and statistics** - Completion rate, weekly trends

### 📅 Appointments
- Monthly calendar with French view
- Integration of tasks and appointments
- Reminders and notes
- Color coding by family member
- **🔔 Automatic notifications** - Reminders 30min and 1h before each appointment

### 🍳 Recipes
- Family recipe library
- Categories (Appetizer, Main Course, Dessert, Snack)
- Preparation and cooking time
- Portions and tags
- **🔍 Advanced filters** - By category, preparation time, difficulty

### 🍽️ Meal Planning
- Weekly view (Monday-Sunday)
- 4 meal types per day (Breakfast, Lunch, Dinner, Snack)
- Automatic linking with recipes
- **📄 PDF Export** - Print your weekly meal plan

### 💰 Family Budget
- Monthly expense tracking
- 6 categories: Food, Health, Children, Home, Leisure, Other
- Budget definition per category
- Progress charts
- Overspending alerts
- **📊 Advanced statistics** - 6-month trends, category breakdown

### 👨‍👩‍👧‍👦 Family Management
- Profiles for each member
- Health information (blood type, allergies, vaccines)
- Emergency contact
- Medical notes
- Custom color coding

---

## 🚀 Quick Start

### Option 1: Docker (Recommended) ⭐

The simplest method! Use our pre-configured Docker image:

```bash
# 1. Download configuration files
mkdir openfamily && cd openfamily
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example
cp .env.example .env

# 2. Change password (optional)
nano .env  # Change DB_PASSWORD

# 3. Start OpenFamily
docker compose up -d

# 4. Access the application
# http://localhost:3000
```

**That's it!** 🎉 The application and database are automatically configured.

### Option 2: Manual Installation

For developers or if you can't use Docker:

```bash
# 1. Clone the repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# 2. Install PostgreSQL (if not already installed)
# Windows: https://www.postgresql.org/download/windows/
# Linux: sudo apt install postgresql
# macOS: brew install postgresql

# 3. Create the database
psql -U postgres
CREATE DATABASE openfamily;
\q

# 4. Configure environment
cp .env.example .env
nano .env  # Adjust DATABASE_URL with your credentials

# 5. Install and start
pnpm install
pnpm build
pnpm start
```

---

## 📦 Installation

### Prerequisites

#### With Docker (Recommended)
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux)
- **2 GB RAM minimum**
- **5 GB disk space**

#### Without Docker
- **Node.js 20+** and **pnpm**
- **PostgreSQL 14+**
- **2 GB RAM minimum**
- **10 GB disk space**

### Detailed Installation

📖 **Complete guide**: [FIRST_INSTALLATION.md](FIRST_INSTALLATION.md)

The official Docker image is available on Docker Hub: [nexaflow/openfamily](https://hub.docker.com/r/nexaflow/openfamily)

### Network Configuration

#### Local access only
The application works immediately on `http://localhost:3000`

#### Local network access (LAN)
1. Find your server's IP: `ip addr show` (Linux) or `ipconfig` (Windows)
2. Access from any device: `http://192.168.X.X:3000`
3. **Automatic detection**: The app detects it's hosted and enables server mode

#### Internet access (optional)
See the [Deployment Guide](PRODUCTION.md) for:
- Configuring a domain name
- Installing an SSL certificate (HTTPS)
- Securing access

### Updates

#### With Docker
```bash
docker compose pull
docker compose up -d
```

#### Without Docker
```bash
git pull
pnpm install
pnpm build
pnpm start
```

#### Option 1: PWA (Recommended)
1. Access your OpenFamily instance (e.g., `http://192.168.1.100:3000`)
2. On mobile: click "Add to Home Screen"
3. On desktop: click the install icon in the address bar
4. The app will install like a native app

#### Option 2: Native Mobile Applications
- **Android**: Install the APK available in releases
- **iOS**: Use TestFlight or compile from source code

#### Option 3: Web Browser
Simply access your OpenFamily server URL from any modern browser (Chrome, Safari, Firefox, Edge).

## 💾 Data Storage

OpenFamily uses a **centralized server architecture with PostgreSQL**:

### 🗄️ Architecture

- **Database**: PostgreSQL (included in Docker Compose)
- **API Server**: Express.js (Node.js)
- **Synchronization**: Real-time via REST API
- **Security**: Authentication token, family isolation

### 📊 Stored Data

All data is stored in PostgreSQL:
- `shopping_items` - Shopping list
- `tasks` - Tasks and schedule
- `appointments` - Appointments
- `family_members` - Family members (with health info)
- `recipes` - Recipes
- `meals` - Meal planning
- `budgets` - Monthly budgets
- `families` - Family configuration

### 🔄 Automatic Synchronization

- ✅ **Multi-device**: Access from PC, tablet, smartphone
- ✅ **Real-time**: Changes are instant
- ✅ **Automatic detection**: The app detects the server on the network
- ✅ **Default family**: Automatic initial configuration

### 💾 Backup

PostgreSQL data is persisted via Docker volumes:

```bash
# Manual backup
docker exec openfamily-db pg_dump -U openfamily openfamily > backup.sql

# Restore from backup
docker exec -i openfamily-db psql -U openfamily openfamily < backup.sql
```

**Recommendation**: Configure daily automatic backups with cron or a PostgreSQL backup tool.

## ✨ Advanced Features

### 🔔 Smart Notifications
- Automatic reminders 30 minutes and 1 hour before each appointment
- Reminders 15 minutes before and at exact time for tasks with due dates
- Browser notification support (permission required)

### 💡 Smart Shopping List
- Automatic ingredient suggestions based on your planned meals
- Analysis of recipes for the upcoming week
- One-click addition from suggestions

### 📊 Statistics and Dashboard
- Overview of all your activities
- Task completion rate (global and weekly)
- Real-time budget usage with trend charts
- Meal planning trends
- Charts and visual indicators

### 🎯 Automatic Meal Planning
- Automatic generation of a weekly plan
- Smart selection based on recipe categories
- Avoids repetitions over several days
- Integration with your existing recipes

### 🔍 Global Search
- Instant search across all your data (Ctrl/Cmd+K)
- Results grouped by category: shopping, tasks, appointments, recipes, meals
- Quick navigation to any page

### 🚀 Quick Actions
- Widgets on homepage to quickly create tasks and items
- Inline forms with keyboard support (Enter key)
- Direct access to main features

### 🌙 Automatic Theme
- Light, dark or automatic mode
- Automatic detection of system preferences
- Cycle between 3 modes with a single click

### 💾 Data Import/Export
- Complete JSON export with versioning
- Backup import with confirmation
- Manual or automatic backup of all your data

### ⚡ Quick Add
- Floating button accessible from anywhere in the app
- Express addition of tasks or shopping items
- Minimal interface for quick entry

### 🩺 Family Health Tracking
- Blood type for each member
- List of allergies
- Vaccination history with dates and reminders
- Personal medical notes
- Emergency contact (name, phone, relationship)

## 🛠️ Technologies

### Frontend
- **React 19 + TypeScript** - Modern and typed user interface
- **Vite 7** - Ultra-fast build tool
- **TailwindCSS + shadcn/ui** - Elegant and consistent design system
- **Wouter** - Lightweight routing
- **date-fns** - Date manipulation
- **Recharts** - Charts and visualizations

### Backend (Server Mode)
- **Node.js 20+ + Express** - REST API
- **PostgreSQL 16** - Relational database
- **TypeScript** - Backend typing
- **Docker + Docker Compose** - Containerization and deployment

### Storage
- **PostgreSQL** - Centralized database with automatic synchronization
- **Repository Pattern** - Clean data access abstraction
- **Docker Volumes** - Data persistence

### Mobile
- **Capacitor** - Android/iOS build
- **Service Worker** - Offline mode (PWA)

## 📱 Compatibility

- Chrome/Edge (desktop & mobile)
- Safari (iOS & macOS)
- Firefox
- Any modern browser supporting localStorage and Service Workers

## 🔐 Privacy

This application respects your privacy according to the chosen mode:

### Local Mode
- ❌ Sends **no data** to external servers
- ❌ Uses **no centralized database**
- ❌ Requires **no user account**
- ✅ Stores **everything locally** on your device
- ✅ Works **completely offline**

### Server Mode
- ✅ **You control the infrastructure** - Host on your own server
- ✅ **No third party involved** - No external cloud
- ✅ **Encryption in transit** - HTTPS recommended
- ✅ **Open Source** - Verifiable and auditable code
- 📝 **Responsibility** - You manage your server's security

---

## ❓ FAQ

### Are my data secure?
**Local Mode**: Yes, all your data is stored locally in your browser. It never leaves your device.

**Server Mode**: Your data is stored on your own server. You have full control and responsibility for security.

### Can I use the application offline?
**Local Mode**: Absolutely! Once installed as a PWA, the application works completely offline.

**Server Mode**: A connection to the server is required to synchronize data. Offline features may be limited.

### How do I backup my data?
**Local Mode**: Go to Settings → Backup to download a JSON file containing all your data.

**Server Mode**: Configure automatic backups of your PostgreSQL database (see [DEPLOYMENT.md](docs/DEPLOYMENT.md)).

### Is the application available in multiple languages?
Yes! The interface is available in **French 🇫🇷**, **English 🇬🇧**, **German 🇩🇪**, and **Spanish 🇪🇸**. You can change the language during initial setup or in Settings.

### Does the application work on iOS?
Yes, you can install it as a PWA from Safari. On Android, you can also install the APK.

### Can I synchronize between multiple devices?
**Local Mode**: Use the export/import function to manually transfer your data.

**Server Mode**: Yes! Self-hosted server mode allows automatic synchronization between all family devices.

### Is the application really free?
Yes, 100% free and open source. No hidden fees, no subscription.

---

## 📄 License

AGPL-3.0 with non-commercial clause - The project is open source and forkable, but commercial use requires explicit permission. See the [LICENSE](LICENSE) file for more details.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open issues to report bugs
- Suggest improvements
- Submit pull requests

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## 📚 Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technical architecture and Repository pattern
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Server deployment guide (Docker, PostgreSQL, Nginx)
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guide
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Code of conduct
- [CHANGELOG.md](CHANGELOG.md) - Version history

---

<div align="center">

Made with ❤️ by [NexaFlow](https://github.com/NexaFlowFrance)

[⬆ Back to top](#openfamily)

</div>
