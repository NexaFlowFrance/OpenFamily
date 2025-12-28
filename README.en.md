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

OpenFamily is a comprehensive family management application offered as open source by [NexaFlow](http://nexaflow.fr), that prioritizes your privacy. All your data stays on your device, no central server, no account required. Manage your shopping lists, tasks, appointments, recipes, meal planning, and family budget securely.

## 🚀 Key Features

- ✅ **100% Local or Self-Hosted** - Choose between local storage or self-hosted server for family synchronization
- 📱 **PWA** - Install the app as a native application on mobile/tablet
- 🔒 **Private** - Your data never leaves your device (local mode) or stays on your server (server mode)
- 🌐 **Offline** - Works without internet connection in local mode
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

### Local Mode (Without server)

```bash
# Clone the repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git

# Install dependencies
cd OpenFamily
pnpm install

# Run in development mode
pnpm dev

# Open http://localhost:3000
```

### Server Mode (Self-hosted with Docker)

```bash
# Clone the repository
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# Create the .env file
cp .env.example .env
# Modify DB_PASSWORD in .env with a secure password

# Launch with Docker Compose
docker-compose up -d

# The application will be available at http://localhost:3000
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for more details on server deployment.

---

## 📦 Installation

### For Developers

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Build for Android (APK)
pnpm cap:android

# Build for iOS (IPA)
pnpm cap:ios
```

### For Users

#### Option 1: PWA (Recommended)
1. Open the application in your browser (Chrome, Safari, Edge)
2. On mobile: click "Add to Home Screen"
3. On desktop: click the install icon in the address bar

#### Option 2: Native Applications
- **Android**: Download the APK from releases
- **iOS**: Install via TestFlight or an alternative store

#### Option 3: Self-hosting
1. Clone this repository
2. Run `pnpm install && pnpm build`
3. Host the contents of the `dist/public` folder on any static web server
4. Or simply use `pnpm start` for a local server

#### Option 4: Local HTML File
1. After building, simply open `dist/public/index.html` in your browser
2. The application will work entirely locally

## 💾 Data Storage

OpenFamily offers **two storage modes** that you can choose during initial setup:

### 📱 Local Mode (Default)

All data is stored in your browser's **localStorage**:
- ✅ **100% private** - Data never leaves your device
- ✅ **Works offline** - No internet connection required
- ✅ **Free** - No server to host
- ⚠️ **No synchronization** - Data stays on a single device

Stored data:
- `openfamily_shopping` - Shopping list
- `openfamily_tasks` - Tasks and schedule
- `openfamily_appointments` - Appointments
- `openfamily_members` - Family members (with health info)
- `openfamily_recipes` - Recipes
- `openfamily_meals` - Meal planning
- `openfamily_budgets` - Monthly budgets

### 🔄 Server Mode (Self-hosted)

Data stored on your own server with PostgreSQL:
- ✅ **Family synchronization** - Share data with the whole family
- ✅ **Multi-device access** - Use the app on multiple devices
- ✅ **Centralized backup** - All data on your server
- ✅ **Full control** - You manage your infrastructure
- 📝 **Configuration required** - Linux server, Docker, domain name (optional)

To configure server mode, see the [Deployment Guide](docs/DEPLOYMENT.md).

### Backup and Restore (Local Mode)

From the application's **Settings**:
- 📥 **Download backup**: Complete JSON export of all your data
- 📤 **Import backup**: Restore from a JSON file
- 🗑️ **Reset**: Delete all data (with confirmation)

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
- **localStorage** - Local mode (browser)
- **PostgreSQL** - Server mode (self-hosted)
- **Repository Pattern** - Storage abstraction for both modes

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
- ✅ Works **entirely offline**

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
**Local Mode**: Absolutely! Once installed as a PWA, the application works entirely offline.

**Server Mode**: A connection to the server is necessary to synchronize data. Offline features may be limited.

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
