# OpenFamily - Docker Start Script
# This script starts OpenFamily with PostgreSQL using Docker

Write-Host "🚀 Starting OpenFamily with Docker..." -ForegroundColor Green

# Check if Docker is running
try {
    docker ps | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Create .env if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file with default configuration..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

# Load environment variables
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
}

$DB_PASSWORD = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "openfamily_secure_2026" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$APP_PORT = if ($env:APP_PORT) { $env:APP_PORT } else { "3000" }

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Database Port: $DB_PORT"
Write-Host "  Application Port: $APP_PORT"
Write-Host ""

# Start PostgreSQL container
Write-Host "🐘 Starting PostgreSQL..." -ForegroundColor Blue
docker run -d `
    --name openfamily-postgres `
    --restart unless-stopped `
    -e POSTGRES_DB=openfamily `
    -e POSTGRES_USER=openfamily `
    -e POSTGRES_PASSWORD=$DB_PASSWORD `
    -v openfamily-postgres-data:/var/lib/postgresql/data `
    -v "${PWD}\server\schema.sql:/docker-entrypoint-initdb.d/schema.sql:ro" `
    -p "${DB_PORT}:5432" `
    postgres:16-alpine

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  PostgreSQL container already exists, starting it..." -ForegroundColor Yellow
    docker start openfamily-postgres
}

# Wait for PostgreSQL to be ready
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Build the application
Write-Host "🔨 Building OpenFamily application..." -ForegroundColor Blue
pnpm build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Start the application container
Write-Host "🚀 Starting OpenFamily application..." -ForegroundColor Blue
docker run -d `
    --name openfamily-app `
    --restart unless-stopped `
    -e NODE_ENV=production `
    -e DATABASE_URL="postgresql://openfamily:${DB_PASSWORD}@host.docker.internal:${DB_PORT}/openfamily" `
    -e PORT=3000 `
    -v openfamily-app-data:/app/data `
    -p "${APP_PORT}:3000" `
    --add-host=host.docker.internal:host-gateway `
    node:20-alpine `
    sh -c "cd /app && npm start"

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Application container already exists, restarting it..." -ForegroundColor Yellow
    docker stop openfamily-app
    docker rm openfamily-app
    docker run -d `
        --name openfamily-app `
        --restart unless-stopped `
        -e NODE_ENV=production `
        -e DATABASE_URL="postgresql://openfamily:${DB_PASSWORD}@host.docker.internal:${DB_PORT}/openfamily" `
        -e PORT=3000 `
        -v "${PWD}\dist:/app/dist" `
        -v openfamily-app-data:/app/data `
        -p "${APP_PORT}:3000" `
        --add-host=host.docker.internal:host-gateway `
        node:20-alpine `
        sh -c "cd /app && node dist/index.js"
}

Write-Host ""
Write-Host "✅ OpenFamily is starting!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Application: http://localhost:$APP_PORT" -ForegroundColor Cyan
Write-Host "🐘 PostgreSQL: localhost:$DB_PORT" -ForegroundColor Cyan
Write-Host ""
Write-Host "View logs with:" -ForegroundColor Yellow
Write-Host "  docker logs -f openfamily-app"
Write-Host ""
Write-Host "Stop with:" -ForegroundColor Yellow
Write-Host "  docker stop openfamily-app openfamily-postgres"
