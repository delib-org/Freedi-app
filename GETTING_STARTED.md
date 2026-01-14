# Getting Started with Freedi

Welcome to Freedi! This guide will get you up and running in just a few minutes.

## What is Freedi?

Freedi is an open-source deliberation platform that helps communities and organizations make better collective decisions through structured discussions and consensus-building.

## Quick Start (2 minutes)

### Prerequisites

You only need ONE of these:
- **Docker Desktop** (recommended) - [Download here](https://www.docker.com/products/docker-desktop)
- **OR** Node.js 18+ and Java 11+

### Setup

```bash
# Clone the repository
git clone https://github.com/delib-org/Freedi-app.git
cd Freedi-app

# Run the setup wizard
npm start
```

The wizard will guide you through the setup process. Choose:
- **Quick Start** - No account needed, uses local emulators
- **Docker** - Containerized environment, most consistent
- **Full Setup** - For deployment, requires Firebase account

### Start Developing

After setup, start the development server:

```bash
# With Docker
docker compose up

# Without Docker
npm run dev:emulator
```

Then open http://localhost:5173 in your browser.

## Project Structure

```
Freedi-app/
├── src/                    # Main React application
│   ├── components/         # Reusable UI components
│   ├── controllers/        # Business logic
│   ├── redux/              # State management
│   └── view/               # Pages and views
├── functions/              # Firebase Cloud Functions
├── apps/
│   ├── mass-consensus/     # Mass Consensus app (Next.js)
│   └── sign/               # Sign app
├── packages/
│   └── shared-types/       # Shared TypeScript types
└── docs/                   # Documentation
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run setup wizard |
| `npm run dev` | Start development server |
| `npm run dev:emulator` | Start with Firebase emulators |
| `npm run docker:up` | Start with Docker |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test` | Run tests |
| `npm run build` | Build for production |

## Development Resources

- **[CLAUDE.md](./CLAUDE.md)** - Code style guide and conventions
- **[DOCKER.md](./DOCKER.md)** - Docker setup details
- **[docs/design-guide.md](./docs/design-guide.md)** - UI/UX design system

## Need Help?

- Open an issue on [GitHub](https://github.com/delib-org/Freedi-app/issues)
- Check existing documentation in the `docs/` folder

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Follow the guidelines in [CLAUDE.md](./CLAUDE.md)
4. Submit a pull request

Thank you for contributing to open-source deliberation tools!
