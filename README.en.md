# OpenFamily

<div align="center">

![License](https://img.shields.io/badge/License-AGPL--3.0--NC-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)

**100% local and open source application for family life management**

[🇫🇷 Français](README.md) | 🇬🇧 English | [🇩🇪 Deutsch](README.de.md) | [🇪🇸 Español](README.es.md)

[Features](#-features) •
[Installation](#-installation) •
[Documentation](#-documentation) •
[Contributing](#-contributing) •
[License](#-license)

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

**Version 1.0.3 - Server-only architecture**  
This version completely removes localStorage mode in favor of a centralized server architecture with PostgreSQL, ensuring reliable synchronization across all family devices.

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
- Export/Import lists
- **📋 List templates** - Save and reuse your recurring lists
- **📱 Barcode scanning** - Add items by scanning (mobile only)

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
- Planning export
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

### ⚡ Automatic Installation with Docker

```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-docker.sh | bash
```

This script will:
- Install Docker and Docker Compose (if needed)
- Clone the OpenFamily repository
- Configure PostgreSQL
- Start the application on port 3000

---

## 📦 Installation

### Prerequisites

- **Linux Server** (Ubuntu 20.04+ recommended) or Windows with WSL
- **Docker & Docker Compose** (automatically installed by the script)
- **2 GB RAM minimum**
- **10 GB disk space**

### Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# 2. Create the .env file
cp .env.example .env

# 3. Modify PostgreSQL password in .env
nano .env  # Change DB_PASSWORD

# 4. Launch with Docker Compose
docker-compose up -d

# 5. Access the application
# http://localhost:3000 (local)
# http://your-ip:3000 (local network)
# https://your-domain.com (with reverse proxy)
```

### Network Configuration

#### Local access only
The application works immediately on `http://localhost:3000`

#### Local network access (LAN)
1. Find your server's IP: `ip addr show` or `ipconfig`
2. Access from any device: `http://192.168.X.X:3000`
3. **Automatic detection**: The app detects it's hosted and enables server mode

#### Internet access (optional)
See the [Deployment Guide](docs/DEPLOYMENT.md) for:
- Configuring a domain name
- Installing an SSL certificate (HTTPS)
- Securing access with authentication

### For Developers

```bash
# Install dependencies
pnpm install

# Start PostgreSQL locally
docker-compose up -d postgres

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

**Note**: Development mode (`pnpm dev`) requires PostgreSQL. Use Docker Compose to start only the database.

### For Users

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

### Backend
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

OpenFamily is designed with privacy in mind:

- ✅ **Self-hosted** - You control the infrastructure
- ✅ **No third party** - No external cloud services
- ✅ **Encryption** - HTTPS recommended for secure communication
- ✅ **Open Source** - Verifiable and auditable code
- ✅ **Family isolation** - Each family's data is completely separate
- 📝 **Your responsibility** - You manage your server's security

---

## ❓ FAQ

### Are my data secure?
Yes, your data is stored on your own server. You have full control and responsibility for security. We recommend:
- Using strong PostgreSQL passwords
- Enabling HTTPS with SSL certificates
- Keeping your server updated
- Configuring regular backups

### Can I use the application offline?
A connection to the server is required to synchronize data. Once data is loaded, the PWA can cache content for brief offline periods, but changes won't sync until connection is restored.

### How do I backup my data?
Configure automatic backups of your PostgreSQL database:
```bash
# Manual backup
docker exec openfamily-db pg_dump -U openfamily openfamily > backup.sql

# Automatic backup with cron (daily at 2am)
0 2 * * * docker exec openfamily-db pg_dump -U openfamily openfamily > /backups/openfamily-$(date +\%Y\%m\%d).sql
```
See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for more details.

### Is the application available in multiple languages?
Yes! The interface is available in **French 🇫🇷**, **English 🇬🇧**, **German 🇩🇪**, and **Spanish 🇪🇸**. You can change the language in Settings.

### Does the application work on iOS?
Yes, you can install it as a PWA from Safari. Access your OpenFamily server URL and add it to your home screen. On Android, you can also install the APK.

### Can I synchronize between multiple devices?
Yes! That's the main advantage of the server architecture. All family members can access the same data from their own devices (PC, tablet, smartphone). Changes sync instantly.

### Is the application really free?
Yes, 100% free and open source. No hidden fees, no subscription. You only need to host it on your own server (or use a free tier on cloud providers).

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
