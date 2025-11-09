# Monorepo Guide: Building Multiple Apps from Freedi

This guide explains how to restructure Freedi into a monorepo to share code between multiple applications (e.g., main Freedi app, forum, mass-consensus) without duplicating code.

## 📚 Table of Contents

- [Why Monorepo?](#why-monorepo)
- [Architecture Overview](#architecture-overview)
- [Setup Instructions](#setup-instructions)
- [Development Workflow](#development-workflow)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Why Monorepo?

### Problem with Separate Repositories

When building multiple apps (Freedi, Forum, Mass Consensus) that share core logic:

❌ **Code Duplication**: Copy-paste statement management, evaluations, Firebase utilities
❌ **Update Bottleneck**: Changes to shared code require publishing npm packages
❌ **Version Hell**: Apps can end up with different versions of shared code
❌ **Slow Iteration**: Need multiple PRs across repos for single feature

### Monorepo Solution

✅ **Single Source of Truth**: Shared code in one place
✅ **Instant Updates**: Edit shared code, all apps see changes immediately
✅ **One Pull Request**: Change shared code + all apps together
✅ **No Publishing**: No need to publish packages to npm
✅ **Easy Testing**: Test changes across all apps locally
✅ **Better Collaboration**: Developers can edit everything in one repo

---

## Architecture Overview

### Current Structure (Single App)

```
freedi-app/
├── src/
│   ├── controllers/db/        # Business logic
│   ├── redux/                 # State management
│   ├── utils/                 # Utilities
│   ├── services/              # Services
│   └── view/                  # UI components
├── functions/                 # Firebase Functions
└── package.json
```

### New Structure (Monorepo)

```
freedi-platform/                          # ONE Git repository
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # Workspace definition
├── turbo.json                            # Build orchestration
├── .github/
│   └── workflows/
│       ├── deploy-freedi.yml             # CI/CD for Freedi
│       └── deploy-forum.yml              # CI/CD for Forum
├── packages/
│   └── shared/                           # ✅ Shared business logic
│       ├── package.json
│       └── src/
│           ├── db/                       # Database operations
│           │   ├── statements/
│           │   ├── evaluation/
│           │   ├── vote/
│           │   ├── subscriptions/
│           │   └── membership/
│           ├── redux/                    # Redux slices
│           │   ├── statements/
│           │   ├── evaluations/
│           │   └── votes/
│           ├── utils/                    # Utilities
│           │   ├── firebaseUtils.ts
│           │   ├── errorHandling.ts
│           │   └── firestoreListenerHelpers.ts
│           ├── services/                 # Services
│           │   ├── analytics/
│           │   ├── logger/
│           │   └── notificationService.ts
│           ├── helpers/                  # Helper functions
│           ├── constants/                # Application constants
│           └── index.ts                  # Main export
└── apps/
    ├── freedi-web/                       # Main Freedi app
    │   ├── .firebaserc
    │   ├── firebase.json
    │   ├── package.json
    │   ├── functions/                    # Firebase Functions
    │   └── src/
    │       ├── view/                     # Freedi-specific UI
    │       ├── pages/                    # Freedi pages
    │       └── main.tsx
    ├── forum/                            # Forum app
    │   ├── .firebaserc
    │   ├── firebase.json
    │   ├── package.json
    │   └── src/
    │       ├── components/               # Forum-specific UI
    │       │   ├── Thread.tsx
    │       │   ├── Post.tsx
    │       │   └── Upvote.tsx
    │       ├── pages/                    # Forum pages
    │       └── main.tsx
    └── mass-consensus/                   # Mass consensus app
        ├── .firebaserc
        ├── firebase.json
        ├── package.json
        └── src/
            ├── components/               # Mass consensus UI
            └── pages/
```

### What Goes Where?

| Code Type | Location | Example |
|-----------|----------|---------|
| **Business Logic** | `packages/shared/` | Statement CRUD, evaluations, voting |
| **Database Operations** | `packages/shared/db/` | `saveStatementToDB()`, `setEvaluationToDB()` |
| **Redux State** | `packages/shared/redux/` | `statementsSlice`, `evaluationsSlice` |
| **Firebase Utilities** | `packages/shared/utils/` | `createStatementRef()`, `executeBatchUpdates()` |
| **Services** | `packages/shared/services/` | Analytics, logging, notifications |
| **UI Components** | `apps/{app-name}/src/` | Freedi UI, Forum UI, etc. |
| **Pages/Routes** | `apps/{app-name}/src/pages/` | App-specific pages |
| **App Styling** | `apps/{app-name}/src/styles/` | App-specific CSS/SCSS |

---

## Setup Instructions

### Step 1: Install pnpm (if not already installed)

```bash
npm install -g pnpm
```

**Why pnpm?**
- Faster than npm/yarn (hard links instead of copying)
- Better workspace support
- Saves disk space (shared dependencies)

### Step 2: Create Monorepo Structure

#### 2.1 Initialize Root Workspace

```bash
# Create new directory for monorepo
mkdir freedi-platform
cd freedi-platform

# Initialize root package.json
pnpm init
```

#### 2.2 Create Workspace Configuration

**Create `pnpm-workspace.yaml`:**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Update root `package.json`:**

```json
{
  "name": "freedi-platform",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "turbo run dev",
    "dev:freedi": "turbo run dev --filter=freedi-web",
    "dev:forum": "turbo run dev --filter=forum",
    "build": "turbo run build",
    "build:freedi": "turbo run build --filter=freedi-web",
    "build:forum": "turbo run build --filter=forum",
    "deploy:freedi": "pnpm build:freedi && cd apps/freedi-web && firebase deploy",
    "deploy:forum": "pnpm build:forum && cd apps/forum && firebase deploy",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "~5.7.3"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

#### 2.3 Create Turborepo Configuration

**Create `turbo.json`:**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Step 3: Extract Shared Package

#### 3.1 Create Shared Package Structure

```bash
mkdir -p packages/shared/src
cd packages/shared
```

**Create `packages/shared/package.json`:**

```json
{
  "name": "@freedi/shared",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./db/*": "./src/db/*/index.ts",
    "./redux/*": "./src/redux/*/index.ts",
    "./utils/*": "./src/utils/*.ts",
    "./services/*": "./src/services/*/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "firebase": "^11.0.2",
    "delib-npm": "^5.6.63",
    "valibot": "^1.0.0-rc.1",
    "@reduxjs/toolkit": "^1.9.5",
    "react-redux": "^8.1.1"
  },
  "devDependencies": {
    "typescript": "~5.7.3",
    "@types/node": "^22.10.7"
  }
}
```

**Create `packages/shared/tsconfig.json`:**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### 3.2 Move Shared Code

Copy these directories from `freedi-app/src/` to `packages/shared/src/`:

```bash
# From freedi-app directory
cp -r src/controllers/db packages/shared/src/
cp -r src/redux packages/shared/src/
cp -r src/utils packages/shared/src/
cp -r src/services packages/shared/src/
cp -r src/helpers packages/shared/src/
cp -r src/constants packages/shared/src/
cp -r src/types packages/shared/src/
```

**Create `packages/shared/src/index.ts`:**

```typescript
// Database operations
export * from './db/statements/setStatements';
export * from './db/statements/getStatement';
export * from './db/evaluation/setEvaluation';
export * from './db/evaluation/getEvaluation';
export * from './db/vote/setVote';
export * from './db/vote/getVotes';
export * from './db/subscriptions/setSubscriptions';
export * from './db/membership/getMembership';

// Redux slices
export * from './redux/statements/statementsSlice';
export * from './redux/evaluations/evaluationsSlice';
export * from './redux/votes/votesSlice';
export * from './redux/store';

// Utilities
export * from './utils/firebaseUtils';
export * from './utils/errorHandling';
export * from './utils/firestoreListenerHelpers';

// Services
export * from './services/analytics';
export * from './services/logger';
export * from './services/notificationService';

// Helpers
export * from './helpers/roleHelpers';
export * from './helpers/timestampHelpers';

// Constants
export * from './constants/common';
```

### Step 4: Create App Packages

#### 4.1 Freedi Web App

```bash
mkdir -p apps/freedi-web
cd apps/freedi-web
```

**Copy from original freedi-app:**

```bash
# Copy UI code
cp -r ../../freedi-app/src/view ./src/
cp -r ../../freedi-app/src/assets ./src/
cp -r ../../freedi-app/src/main.tsx ./src/

# Copy Firebase config
cp ../../freedi-app/.firebaserc ./
cp ../../freedi-app/firebase.json ./
cp -r ../../freedi-app/functions ./

# Copy config files
cp ../../freedi-app/vite.config.ts ./
cp ../../freedi-app/tsconfig.json ./
cp ../../freedi-app/index.html ./
```

**Update `apps/freedi-web/package.json`:**

```json
{
  "name": "freedi-web",
  "version": "5.4.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "deploy": "firebase deploy",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@freedi/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-redux": "^8.1.1",
    "react-router": "^7.1.5",
    "firebase": "^11.0.2",
    "delib-npm": "^5.6.63"
  },
  "devDependencies": {
    "@vitejs/plugin-react-swc": "^3.7.2",
    "typescript": "~5.7.3",
    "vite": "^6.0.7"
  }
}
```

**Update imports in `apps/freedi-web/src/`:**

Replace all imports from local files to shared package:

```typescript
// Before
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { setStatement } from '@/redux/statements/statementsSlice';
import { logError } from '@/utils/errorHandling';

// After
import { saveStatementToDB } from '@freedi/shared/db/statements';
import { setStatement } from '@freedi/shared/redux/statements';
import { logError } from '@freedi/shared/utils/errorHandling';
```

#### 4.2 Forum App (New)

```bash
mkdir -p apps/forum
cd apps/forum
```

**Create `apps/forum/package.json`:**

```json
{
  "name": "forum",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "deploy": "firebase deploy",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@freedi/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-redux": "^8.1.1",
    "react-router": "^7.1.5",
    "firebase": "^11.0.2",
    "delib-npm": "^5.6.63"
  },
  "devDependencies": {
    "@vitejs/plugin-react-swc": "^3.7.2",
    "typescript": "~5.7.3",
    "vite": "^6.0.7"
  }
}
```

**Create basic forum structure:**

```bash
mkdir -p src/components src/pages src/styles
```

**Example `apps/forum/src/components/Thread.tsx`:**

```typescript
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  saveStatementToDB,
  setStatement,
  setEvaluationToDB
} from '@freedi/shared';
import { Statement, StatementType, Access, User } from 'delib-npm';

interface ThreadProps {
  parentStatement: Statement;
  currentUser: User;
}

export function Thread({ parentStatement, currentUser }: ThreadProps) {
  const dispatch = useDispatch();
  const [replyText, setReplyText] = useState('');

  const handleCreateReply = async () => {
    const statement = await saveStatementToDB({
      text: replyText,
      parentStatement,
      statementType: StatementType.statement,
      membership: { access: Access.openToAll },
    });

    if (statement) {
      dispatch(setStatement(statement));
      setReplyText('');
    }
  };

  const handleUpvote = async (statement: Statement) => {
    await setEvaluationToDB(statement, currentUser, 1);
  };

  return (
    <div className="thread">
      <h2>{parentStatement.statement}</h2>
      {/* Forum-specific UI */}
      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
      />
      <button onClick={handleCreateReply}>Post Reply</button>
    </div>
  );
}
```

### Step 5: Install Dependencies

```bash
# From root directory
cd freedi-platform

# Install all dependencies and link packages
pnpm install
```

**What this does:**
- Installs dependencies for root, shared package, and all apps
- Creates symlinks: `apps/forum/node_modules/@freedi/shared` → `../../packages/shared`
- Turborepo is ready to build packages in correct order

---

## Development Workflow

### Starting Development

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm dev:freedi
pnpm dev:forum

# Run from app directory
cd apps/forum
pnpm dev
```

### Making Changes to Shared Code

```bash
# 1. Edit shared package
vim packages/shared/src/db/statements/setStatements.ts

# 2. Changes are immediately available to all apps (via symlink)
# 3. Hot reload works automatically in all running apps! ✅
```

### Adding a New Shared Function

```bash
# 1. Create function in shared package
vim packages/shared/src/db/statements/deleteStatement.ts

# 2. Export from index
vim packages/shared/src/index.ts
# Add: export * from './db/statements/deleteStatement';

# 3. Use in any app
vim apps/forum/src/components/Thread.tsx
# import { deleteStatement } from '@freedi/shared';
```

### Building

```bash
# Build all packages
pnpm build

# Build specific app (automatically builds shared package first)
pnpm build:freedi
pnpm build:forum

# Turborepo caching means second builds are instant!
```

### Testing

```bash
# Test all packages
pnpm test

# Test shared package
cd packages/shared
pnpm test

# Test specific app
cd apps/forum
pnpm test
```

### Linting & Type Checking

```bash
# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck
```

---

## Deployment

### Firebase Deployment Strategy

#### Option 1: Separate Firebase Projects

Each app has its own Firebase project:

```bash
# Deploy Freedi app
pnpm deploy:freedi

# Deploy Forum app
pnpm deploy:forum
```

**Setup:**

```bash
# In apps/freedi-web/.firebaserc
{
  "projects": {
    "default": "freedi-prod",
    "dev": "freedi-dev"
  }
}

# In apps/forum/.firebaserc
{
  "projects": {
    "default": "forum-prod",
    "dev": "forum-dev"
  }
}
```

#### Option 2: Single Firebase Project with Multiple Sites

```bash
# Deploy specific site
firebase deploy --only hosting:freedi-web
firebase deploy --only hosting:forum
```

**Root `firebase.json`:**

```json
{
  "hosting": [
    {
      "site": "freedi-web",
      "public": "apps/freedi-web/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "site": "forum",
      "public": "apps/forum/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ]
}
```

### Manual Deployment Steps

```bash
# 1. Build the app
pnpm build:forum

# 2. Navigate to app directory
cd apps/forum

# 3. Deploy to Firebase
firebase use prod
firebase deploy --only hosting

# 4. Deploy functions (if any)
firebase deploy --only functions
```

### CI/CD with GitHub Actions

**`.github/workflows/deploy-forum.yml`:**

```yaml
name: Deploy Forum App

on:
  push:
    branches: [main]
    paths:
      - 'apps/forum/**'
      - 'packages/shared/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build forum app
        run: pnpm build:forum

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_FORUM }}'
          channelId: live
          projectId: forum-prod
          entryPoint: apps/forum
```

### Smart Deployment (Only Changed Apps)

**`.github/workflows/deploy-changed.yml`:**

```yaml
name: Deploy Changed Apps

on:
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      forum: ${{ steps.filter.outputs.forum }}
      freedi: ${{ steps.filter.outputs.freedi }}
    steps:
      - uses: actions/checkout@v3

      - uses: dorny/paths-filter@v2
        id: filter
        with:
          filters: |
            forum:
              - 'apps/forum/**'
              - 'packages/shared/**'
            freedi:
              - 'apps/freedi-web/**'
              - 'packages/shared/**'

  deploy-forum:
    needs: detect-changes
    if: needs.detect-changes.outputs.forum == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build:forum
      - run: cd apps/forum && firebase deploy

  deploy-freedi:
    needs: detect-changes
    if: needs.detect-changes.outputs.freedi == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build:freedi
      - run: cd apps/freedi-web && firebase deploy
```

---

## Troubleshooting

### Issue: "Cannot find module '@freedi/shared'"

**Solution:**

```bash
# Re-install dependencies to create symlinks
pnpm install

# Verify symlink exists
ls -la apps/forum/node_modules/@freedi/shared
# Should show: @freedi/shared -> ../../../packages/shared
```

### Issue: Changes to shared package not reflected

**Solution:**

```bash
# Restart dev server
pnpm dev:forum

# If using Vite, make sure vite.config.ts has:
export default defineConfig({
  optimizeDeps: {
    exclude: ['@freedi/shared']  // Don't pre-bundle workspace packages
  }
})
```

### Issue: TypeScript errors with shared package

**Solution:**

Update `tsconfig.json` in apps:

```json
{
  "compilerOptions": {
    "paths": {
      "@freedi/shared": ["../../packages/shared/src"],
      "@freedi/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

### Issue: Turborepo not caching builds

**Solution:**

```bash
# Clear Turborepo cache
pnpm turbo run build --force

# Check turbo.json has outputs defined
{
  "pipeline": {
    "build": {
      "outputs": ["dist/**"]  // Must match your build output
    }
  }
}
```

### Issue: Slow pnpm install

**Solution:**

```bash
# Use frozen lockfile in CI
pnpm install --frozen-lockfile

# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: Firebase Functions deployment fails

**Solution:**

Firebase Functions don't understand workspace packages. Create a build step:

```json
// apps/freedi-web/functions/package.json
{
  "scripts": {
    "build": "tsc",
    "predeploy": "npm install && npm run build"
  }
}
```

---

## Best Practices

### 1. Keep Shared Package UI-Agnostic

❌ **Don't:**
```typescript
// packages/shared/src/db/statements/setStatements.ts
import { toast } from 'react-toastify';  // ❌ UI dependency!

export async function saveStatement() {
  await setDoc(...);
  toast.success('Saved!');  // ❌ Don't do this!
}
```

✅ **Do:**
```typescript
// packages/shared/src/db/statements/setStatements.ts
export async function saveStatement() {
  await setDoc(...);
  return { success: true };  // ✅ Return result
}

// apps/forum/src/components/Thread.tsx
const result = await saveStatement();
if (result.success) {
  showToast('Saved!');  // ✅ UI logic in app
}
```

### 2. Version Shared Types in delib-npm

Keep core types (`Statement`, `User`, `Evaluation`) in `delib-npm` package, not in shared package.

### 3. Use Conventional Commits

```bash
git commit -m "feat(shared): add deleteStatement function"
git commit -m "feat(forum): add delete button to threads"
git commit -m "fix(freedi): fix statement creation bug"
```

### 4. Test Shared Code Thoroughly

Since shared code affects all apps, ensure high test coverage:

```bash
cd packages/shared
pnpm test --coverage
# Target: 80%+ coverage
```

### 5. Document Shared APIs

Add JSDoc comments to shared functions:

```typescript
/**
 * Save a statement to Firestore
 *
 * @param props - Statement creation properties
 * @returns Promise resolving to created statement or undefined on error
 *
 * @example
 * const statement = await saveStatementToDB({
 *   text: 'My statement',
 *   parentStatement: parent,
 *   statementType: StatementType.statement
 * });
 */
export async function saveStatementToDB(props: CreateStatementProps): Promise<Statement | undefined> {
  // ...
}
```

---

## Migration Checklist

- [ ] Install pnpm globally
- [ ] Create monorepo structure (package.json, pnpm-workspace.yaml, turbo.json)
- [ ] Create packages/shared with package.json
- [ ] Copy shared code from freedi-app to packages/shared
- [ ] Create packages/shared/src/index.ts with exports
- [ ] Create apps/freedi-web from original freedi-app
- [ ] Update imports in apps/freedi-web to use @freedi/shared
- [ ] Run `pnpm install` from root
- [ ] Test freedi-web app: `pnpm dev:freedi`
- [ ] Create apps/forum (new app)
- [ ] Test forum app: `pnpm dev:forum`
- [ ] Set up Firebase configs for each app
- [ ] Test deployments
- [ ] Set up CI/CD (GitHub Actions)
- [ ] Update documentation
- [ ] Train team on monorepo workflow

---

## Resources

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Monorepo Best Practices](https://monorepo.tools/)
- [Firebase Multiple Sites](https://firebase.google.com/docs/hosting/multisites)

---

## Questions?

If you encounter issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review [pnpm workspaces docs](https://pnpm.io/workspaces)
3. Ask in team chat or create GitHub issue

Happy coding! 🚀
