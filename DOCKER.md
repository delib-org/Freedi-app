# Docker Development Guide

This guide explains how to set up and run Freedi using Docker for a consistent development environment.

## Quick Start

### Option 1: Interactive Setup Wizard (Recommended)

Run the setup wizard which will guide you through the process:

```bash
npm start
# or
npm run setup:quick
```

The wizard offers multiple setup paths:
- **Quick Start**: Uses Firebase emulators, no account needed
- **Docker Quick Start**: Containerized environment with all dependencies
- **Full Setup**: Connect to your own Firebase project

### Option 2: Docker Commands

If you have Docker installed and want to start immediately:

```bash
# Start all services (first run will build images)
docker compose up

# Or build and start
docker compose up --build

# Run in background
docker compose up -d

# Stop all services
docker compose down
```

## What's Included

The Docker setup provides:

| Service | Port | Description |
|---------|------|-------------|
| **Web App** | 5173 | Main Freedi application |
| **Emulator UI** | 4000 | Firebase Emulator dashboard |
| **Auth Emulator** | 9099 | Firebase Authentication |
| **Firestore Emulator** | 8080 | Firestore database |
| **Storage Emulator** | 9199 | Firebase Storage |
| **Functions Emulator** | 5001 | Cloud Functions |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose)
- That's it! All other dependencies (Node.js, Java, Firebase CLI) are included in the container.

## Commands Reference

### Basic Commands

```bash
# Start development environment
npm run docker:up

# Start with rebuild (after Dockerfile changes)
npm run docker:up:build

# Stop all containers
npm run docker:down

# Start all apps (including mass-consensus and sign)
npm run docker:full
```

### Docker Compose Commands

```bash
# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f app

# Restart a service
docker compose restart app

# Execute command in container
docker compose exec app npm run lint

# Shell into container
docker compose exec app bash
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Web App   │    │  Emulators  │    │     MC      │ │
│  │  (Vite)     │───▶│  (Firebase) │◀───│   (Next)    │ │
│  │  :5173      │    │  :4000-9199 │    │   :3001     │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Development Workflow

### 1. Start the Environment

```bash
docker compose up
```

### 2. Access the Apps

- **Freedi App**: http://localhost:5173
- **Firebase Emulator UI**: http://localhost:4000

### 3. Make Changes

Your local files are mounted into the containers, so changes are reflected immediately (hot reload enabled).

### 4. Run Commands

Use `docker compose exec` to run commands inside containers:

```bash
# Run tests
docker compose exec app npm test

# Run linting
docker compose exec app npm run lint

# Type check
docker compose exec app npm run typecheck
```

## Data Persistence

Emulator data is stored in a Docker volume (`emulator-data`). This means:
- Data persists between container restarts
- To reset data: `docker compose down -v`

## Troubleshooting

### Port Already in Use

If you see port conflict errors:

```bash
# Find what's using the port
lsof -i :5173

# Kill the process or change ports in docker-compose.yml
```

### Container Won't Start

```bash
# Check logs
docker compose logs

# Rebuild from scratch
docker compose down -v
docker compose up --build
```

### Hot Reload Not Working

1. Check that volumes are mounted correctly in `docker-compose.yml`
2. Ensure `CHOKIDAR_USEPOLLING=true` is set (already configured)
3. On Windows/Mac, check Docker Desktop file sharing settings

### Out of Disk Space

Docker can accumulate unused images:

```bash
# Clean up unused Docker resources
docker system prune -a
```

## Customization

### Adding Environment Variables

Edit `env/.env.docker` for app-specific variables. For secrets:

1. Create a `.env` file in the project root (git-ignored)
2. Reference it in `docker-compose.yml`:
   ```yaml
   env_file:
     - .env
     - ./env/.env.docker
   ```

### Changing Ports

Edit the `ports` section in `docker-compose.yml`:

```yaml
ports:
  - "3000:5173"  # Maps host:3000 to container:5173
```

### Adding Services

Add new services to `docker-compose.yml`:

```yaml
services:
  my-service:
    image: my-image
    ports:
      - "8000:8000"
    networks:
      - freedi-network
```

## Without Docker (Alternative)

If you prefer not to use Docker:

1. Install Node.js 18+
2. Install Java 11+ (for Firebase emulators)
3. Run the setup wizard: `npm start`
4. Choose "Quick Start" option

## Contributing

When contributing, you can use either:
- **Docker**: Consistent environment, no local dependencies
- **Local**: Faster iteration, more control

Both approaches use Firebase emulators by default, so no Firebase account is required for development.

## Next Steps

After setup, check out:
- [CLAUDE.md](./CLAUDE.md) - Development guidelines
- [docs/design-guide.md](./docs/design-guide.md) - UI/UX design system
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines (if exists)
