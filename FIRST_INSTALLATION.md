# 🚀 First Installation Guide - OpenFamily

## Quick Start with Docker (Recommended) ⭐

**The easiest way to run OpenFamily!** Everything is pre-configured and ready to use.

### Prerequisites

**Windows:**
- Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)

**Linux:**
- Install Docker: `curl -fsSL https://get.docker.com | sh`
- Install Docker Compose: `sudo apt install docker-compose`

**macOS:**
- Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)

### Installation (3 steps!)

1. **Download the configuration file**
   ```bash
   # Create a directory for OpenFamily
   mkdir openfamily
   cd openfamily
   
   # Download docker-compose.yml
   curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml
   curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/.env.example
   cp .env.example .env
   ```

2. **Optional: Customize password**
   
   Edit `.env` file:
   ```env
   DB_PASSWORD=your_secure_password_here
   APP_PORT=3000
   ```

3. **Start OpenFamily**
   ```bash
   docker compose up -d
   ```

4. **Access the application** 🎉
   
   Open your browser to: **http://localhost:3000**

### What Docker Does Automatically

- ✅ Downloads OpenFamily (latest version)
- ✅ Installs PostgreSQL database
- ✅ Creates database and tables
- ✅ Configures networking
- ✅ Starts everything automatically

### Useful Commands

```bash
# View logs
docker compose logs -f

# Stop OpenFamily
docker compose down

# Update to latest version
docker compose pull
docker compose up -d

# Full reset (removes all data!)
docker compose down -v
```

---

## Alternative: Without Docker Compose

If you prefer using Docker commands directly:

### Windows (PowerShell)
```powershell
# Start PostgreSQL
docker run -d `
  --name openfamily-postgres `
  -e POSTGRES_DB=openfamily `
  -e POSTGRES_USER=openfamily `
  -e POSTGRES_PASSWORD=openfamily_secure_2026 `
  -v openfamily-postgres:/var/lib/postgresql/data `
  -p 5432:5432 `
  postgres:16-alpine

# Start OpenFamily
docker run -d `
  --name openfamily-app `
  -e NODE_ENV=production `
  -e DATABASE_URL="postgresql://openfamily:openfamily_secure_2026@host.docker.internal:5432/openfamily" `
  --add-host=host.docker.internal:host-gateway `
  -p 3000:3000 `
  nexaflow/openfamily:latest
```

### Linux/macOS
```bash
# Start PostgreSQL
docker run -d \
  --name openfamily-postgres \
  -e POSTGRES_DB=openfamily \
  -e POSTGRES_USER=openfamily \
  -e POSTGRES_PASSWORD=openfamily_secure_2026 \
  -v openfamily-postgres:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine

# Start OpenFamily
docker run -d \
  --name openfamily-app \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://openfamily:openfamily_secure_2026@openfamily-postgres:5432/openfamily" \
  --link openfamily-postgres \
  -p 3000:3000 \
  nexaflow/openfamily:latest
```

---

## Alternative: Local Installation (Advanced)

For developers or if you can't use Docker:

### 1️⃣ Install PostgreSQL

Download and install from [postgresql.org](https://www.postgresql.org/download/)

### 2️⃣ Create Database

```bash
psql -U postgres
CREATE DATABASE openfamily;
CREATE USER openfamily WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE openfamily TO openfamily;
\q
```

### 3️⃣ Clone and Configure

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily

# Create .env file
echo "DATABASE_URL=postgresql://openfamily:your_password@localhost:5432/openfamily" > .env
echo "NODE_ENV=production" >> .env
echo "PORT=3000" >> .env
```

### 4️⃣ Install and Start

```bash
npm install -g pnpm
pnpm install
pnpm build
pnpm start
```

---

## 🆘 Troubleshooting

### Docker Issues

**"Cannot connect to Docker daemon"**
- Windows/Mac: Start Docker Desktop
- Linux: `sudo systemctl start docker`

**"Port already in use"**
- Edit `.env`: change `APP_PORT=3001`
- Or stop the conflicting service

**"Error response from daemon"**
- Try: `docker compose down` then `docker compose up -d`

### Common Questions

**How do I backup my data?**
```bash
docker compose exec postgres pg_dump -U openfamily openfamily > backup.sql
```

**How do I restore from backup?**
```bash
cat backup.sql | docker compose exec -T postgres psql -U openfamily openfamily
```

**How do I change the database password?**
1. Stop containers: `docker compose down`
2. Edit `.env` file with new password
3. Remove old database: `docker volume rm openfamily_postgres_data`
4. Start again: `docker compose up -d`

---

## 📚 Next Steps

- [User Guide](./README.md)
- [Production Deployment](./PRODUCTION.md)
- [Docker Hub Image](https://hub.docker.com/r/nexaflow/openfamily)
- [GitHub Repository](https://github.com/NexaFlowFrance/OpenFamily)
