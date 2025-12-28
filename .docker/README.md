# OpenFamily Docker Image

[![Docker Pulls](https://img.shields.io/docker/pulls/nexaflow/openfamily)](https://hub.docker.com/r/nexaflow/openfamily)
[![Docker Image Size](https://img.shields.io/docker/image-size/nexaflow/openfamily/latest)](https://hub.docker.com/r/nexaflow/openfamily)
[![GitHub Release](https://img.shields.io/github/v/release/NexaFlowFrance/OpenFamily)](https://github.com/NexaFlowFrance/OpenFamily/releases)

Self-hosted family organization platform with calendar, meal planning, shopping lists, budget tracking, and task management.

## 🚀 Quick Start

### Using Docker Compose (Recommended)

```bash
# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml -o docker-compose.yml

# Create .env file
cat <<EOF >.env
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -base64 32)
EOF

# Start services
docker-compose up -d
```

Access OpenFamily at: `http://localhost:3000`

### Using Docker Run

```bash
# Start PostgreSQL
docker run -d \
  --name openfamily-db \
  -e POSTGRES_DB=openfamily \
  -e POSTGRES_USER=openfamily \
  -e POSTGRES_PASSWORD=your_secure_password \
  -v openfamily-data:/var/lib/postgresql/data \
  postgres:17-alpine

# Start OpenFamily
docker run -d \
  --name openfamily-app \
  -p 3000:3000 \
  -e DB_HOST=openfamily-db \
  -e DB_PASSWORD=your_secure_password \
  -e SESSION_SECRET=$(openssl rand -base64 32) \
  --link openfamily-db:db \
  nexaflow/openfamily:latest
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | PostgreSQL host | `localhost` | ✅ |
| `DB_PORT` | PostgreSQL port | `5432` | ❌ |
| `DB_NAME` | Database name | `openfamily` | ✅ |
| `DB_USER` | Database user | `openfamily` | ✅ |
| `DB_PASSWORD` | Database password | - | ✅ |
| `SESSION_SECRET` | Session secret key | - | ✅ |
| `PORT` | Application port | `3000` | ❌ |
| `NODE_ENV` | Environment | `production` | ❌ |

### Volumes

- `/app/data` - Application data (uploads, cache)
- PostgreSQL data is stored in named volume `postgres_data`

## 📦 Available Tags

- `latest` - Latest stable release
- `v1.0.0` - Specific version
- `v1.0` - Major.minor version
- `v1` - Major version
- `main` - Latest commit on main branch

## ✨ Features

- 📅 **Calendar** - Shared calendar with notifications
- 🍽️ **Meal Planning** - Weekly meal planner with recipes
- 🛒 **Shopping Lists** - Smart lists with categorization
- 💰 **Budget Tracking** - Monthly expense monitoring
- 📋 **Tasks** - Recurring tasks with assignments
- 👨‍👩‍👧‍👦 **Family Profiles** - Health records and emergency contacts
- 📊 **Statistics** - Analytics dashboard
- 🔒 **Privacy** - Self-hosted with optional encryption

## 🌐 Internationalization

Available in:
- 🇫🇷 French
- 🇬🇧 English
- 🇩🇪 German
- 🇪🇸 Spanish

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite 7
- **Backend**: Node.js + Express
- **Database**: PostgreSQL 17
- **UI**: TailwindCSS + shadcn/ui

## 📖 Documentation

- [GitHub Repository](https://github.com/NexaFlowFrance/OpenFamily)
- [Installation Guide](https://github.com/NexaFlowFrance/OpenFamily/blob/main/scripts/README.md)
- [Architecture](https://github.com/NexaFlowFrance/OpenFamily/blob/main/docs/ARCHITECTURE.md)
- [Changelog](https://github.com/NexaFlowFrance/OpenFamily/blob/main/CHANGELOG.md)

## 🔐 Security

- End-to-end encryption (AES-256-GCM)
- No telemetry or tracking
- GDPR compliant
- Regular security updates

## 🐛 Issues & Support

- [Report Issues](https://github.com/NexaFlowFrance/OpenFamily/issues)
- [Discussions](https://github.com/NexaFlowFrance/OpenFamily/discussions)

## 📄 License

MIT License - see [LICENSE](https://github.com/NexaFlowFrance/OpenFamily/blob/main/LICENSE)

## 🙏 Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/NexaFlowFrance/OpenFamily/blob/main/CONTRIBUTING.md)

---

**Maintained by**: [NexaFlow France](https://github.com/NexaFlowFrance)
