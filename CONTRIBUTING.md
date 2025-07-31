# Contributing to Freedi

Thank you for your interest in contributing to Freedi! This guide will help you get started with development.

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have:
- Node.js 18+ and npm
- Java JDK 17+ (for Firebase emulators)
- Git
- A GitHub account
- VS Code (recommended)

### Quick Setup

1. **Fork and Clone**
   ```bash
   # Fork the repository on GitHub first
   git clone https://github.com/YOUR_USERNAME/Freedi-app.git
   cd Freedi-app
   ```

2. **Run Automated Setup**
   ```bash
   npm run setup:all
   ```
   This will guide you through creating your own Firebase project and setting up everything.

3. **Verify Setup**
   ```bash
   npm run verify
   ```

4. **Start Development**
   ```bash
   npm run dev:all
   ```

## 📝 Development Workflow

### 1. Create a Feature Branch

Follow our [branch naming conventions](./Branch-naming-convention.md):

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b bugfix/issue-description
```

### 2. Make Your Changes

- Follow the code style guidelines in [CLAUDE.md](./CLAUDE.md)
- Write clean, readable code
- Add comments for complex logic
- Update tests if needed

### 3. Code Quality Checks

Before committing, ensure your code passes all checks:

```bash
# Lint check
npm run lint

# Type check
npm run typecheck

# Run tests
npm run test

# Or run all checks at once
npm run check-all
```

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add user profile settings"
# or
git commit -m "fix: resolve voting calculation error"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 🧪 Testing

### Running Tests

```bash
# Frontend tests
npm run test

# Function tests
cd functions && npm test

# Watch mode
npm run test:watch
```

### Writing Tests

- Place test files next to the components they test
- Name test files with `.test.ts` or `.test.tsx`
- Aim for meaningful tests, not just coverage

## 🎨 Code Style

### TypeScript
- **Strict mode** - No `any` types allowed
- Use proper types for all variables and functions
- Prefer interfaces over type aliases for objects

### React
- Functional components with hooks
- Use `FC` type for components
- Implement proper error boundaries

### General
- No `console.log` - use `console.error` or `console.info`
- Add newline after imports
- Use camelCase for variables/functions
- Use PascalCase for components/classes

## 📁 Project Structure

```
Freedi-app/
├── src/
│   ├── view/          # React components
│   ├── controllers/   # Business logic
│   ├── redux/        # State management
│   └── types/        # TypeScript types
├── functions/        # Firebase functions
├── public/          # Static assets
└── scripts/         # Build/setup scripts
```

## 🔥 Firebase Development

### Using Your Own Firebase Project

Each developer should use their own Firebase project:
- Prevents conflicts with other developers
- Allows safe experimentation
- Keeps production data secure

The setup script will help you create your own project.

### Emulators

Always use Firebase emulators for local development:
- Auth: http://localhost:9099
- Firestore: http://localhost:8080
- Functions: http://localhost:5001
- Storage: http://localhost:9199
- Emulator UI: http://localhost:5002

## 🤝 Pull Request Guidelines

### Before Submitting

1. Ensure all tests pass
2. Update documentation if needed
3. Add a clear PR description
4. Link related issues

### PR Title Format

Use conventional commit format:
- `feat: description` - New features
- `fix: description` - Bug fixes
- `docs: description` - Documentation
- `refactor: description` - Code refactoring
- `test: description` - Test updates

### Review Process

- PRs require at least one approval
- Address all review comments
- Keep PRs focused and small
- Respond to feedback constructively

## 💡 Getting Help

- Check existing [issues](https://github.com/delib-org/Freedi-app/issues)
- Join our [discussions](https://github.com/delib-org/Freedi-app/discussions)
- Read the [wiki](https://github.com/delib-org/delib-5/wiki)
- Ask in PR comments

## 🚫 What Not to Do

- Don't commit directly to `main` or `dev`
- Don't include sensitive data or secrets
- Don't disable ESLint rules without good reason
- Don't copy-paste code without understanding it
- Don't submit PRs with failing tests

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Redux Toolkit Documentation](https://redux-toolkit.js.org)

Thank you for contributing to Freedi! Your efforts help build better democratic decision-making tools for everyone. 🙏