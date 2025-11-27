# CI/CD Setup Guide

This document explains how to set up the CI/CD pipelines for the Freedi App monorepo.

## Overview

| Application | Platform | Production URL | Trigger |
|-------------|----------|----------------|---------|
| Main Freedi App | Firebase Hosting | wizcol-app.web.app | Push to `main` |
| Mass Consensus App | Vercel | (assigned by Vercel) | Push to `main` |

Both applications support PR preview deployments.

---

## Architecture

```
GitHub Repository
├── main branch
│   ├── Push triggers Firebase production deploy
│   └── Push triggers Vercel production deploy
└── Pull Requests
    ├── Creates Firebase Preview Channel
    └── Creates Vercel Preview deployment
```

---

## Part 1: Firebase Setup (Main App)

### Step 1: Generate Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **wizcol-app**
3. Go to **Project Settings** → **Service accounts**
4. Click **Generate new private key**
5. Download the JSON file

### Step 2: Add GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

#### Firebase Service Account
| Secret Name | Value |
|-------------|-------|
| `FIREBASE_SERVICE_ACCOUNT_WIZCOL` | Entire JSON content from Step 1 |
| `FIREBASE_TOKEN` | Run `firebase login:ci` locally and copy the token |

#### Vite Environment Variables
| Secret Name | How to get it |
|-------------|---------------|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | `wizcol-app.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Console → Realtime Database |
| `VITE_FIREBASE_PROJECT_ID` | `wizcol-app` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `wizcol-app.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project Settings |
| `VITE_FIREBASE_APP_ID` | Firebase Console → Project Settings |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Console → Project Settings |
| `VITE_FIREBASE_VAPID_KEY` | Firebase Console → Cloud Messaging |
| `VITE_SENTRY_DSN` | Sentry Dashboard (optional) |

### Step 3: Verify Firebase Configuration

Ensure `.firebaserc` has the wizcol target:

```json
{
  "projects": {
    "wizcol": "wizcol-app"
  },
  "targets": {
    "wizcol-app": {
      "hosting": {
        "wizcol": ["wizcol-app"]
      }
    }
  }
}
```

### Step 4: Test Locally

```bash
# Login to Firebase
firebase login

# Select wizcol project
firebase use wizcol

# Deploy manually to test
npm run build
firebase deploy --only hosting:wizcol
```

---

## Part 2: Vercel Setup (Mass Consensus App)

You have two options for Vercel deployment:

### Option A: Vercel Dashboard Integration (Recommended)

This is the simpler approach using Vercel's built-in GitHub integration.

#### Step 1: Import Project

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure:
   - **Root Directory**: `apps/mass-consensus`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

#### Step 2: Configure Environment Variables

In Vercel Dashboard → Project → **Settings** → **Environment Variables**:

| Variable | Value | Environment |
|----------|-------|-------------|
| `FIREBASE_PROJECT_ID` | `wizcol-app` | All |
| `FIREBASE_CLIENT_EMAIL` | From service account JSON | All |
| `FIREBASE_PRIVATE_KEY` | From service account JSON (include quotes) | All |
| `GEMINI_API_KEY` | Your Gemini API key | All |
| `CHECK_SIMILARITIES_ENDPOINT` | Cloud Function URL | All |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Same as main app | All |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `wizcol-app.firebaseapp.com` | All |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `wizcol-app` | All |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `wizcol-app.appspot.com` | All |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same as main app | All |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same as main app | All |
| `NEXT_PUBLIC_APP_URL` | Your Vercel production URL | Production |

#### Step 3: Configure Deployment Settings

In Vercel Dashboard → Project → **Settings** → **Git**:

- **Production Branch**: `main`
- **Root Directory**: `apps/mass-consensus`
- **Ignored Build Step**: Leave empty (or use `git diff --quiet HEAD^ HEAD -- .` to skip if no changes)

### Option B: GitHub Actions (Full Control)

If you prefer GitHub Actions for deployment:

#### Step 1: Get Vercel Tokens

1. Go to [Vercel Account Settings](https://vercel.com/account/tokens)
2. Create a new token
3. Run locally to get project/org IDs:
   ```bash
   cd apps/mass-consensus
   npx vercel link
   ```
4. Check `.vercel/project.json` for `orgId` and `projectId`

#### Step 2: Add GitHub Secrets

| Secret Name | Value |
|-------------|-------|
| `VERCEL_TOKEN` | Token from Step 1 |
| `VERCEL_ORG_ID` | From `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |

The workflow at `.github/workflows/deploy-vercel.yml` will handle deployments.

---

## Workflow Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy-firebase.yml` | Production deployment to Firebase |
| `.github/workflows/firebase-preview.yml` | PR preview channels on Firebase |
| `.github/workflows/deploy-vercel.yml` | Production & preview deployments to Vercel |
| `.github/workflows/PR_Validation.yml` | Code validation for PRs |
| `apps/mass-consensus/vercel.json` | Vercel configuration |

---

## Deployment Flow

### On Pull Request

```
PR Opened/Updated
    │
    ├─► Firebase Preview Workflow
    │   ├─► Validate (lint, typecheck)
    │   ├─► Build main app
    │   └─► Deploy to preview channel
    │       └─► Comment on PR with preview URL
    │
    └─► Vercel Preview Workflow
        ├─► Validate mass-consensus
        ├─► Build mass-consensus
        └─► Deploy to Vercel preview
            └─► Comment on PR with preview URL
```

### On Merge to Main

```
Merge to main
    │
    ├─► Firebase Production Workflow
    │   ├─► Validate (lint, typecheck)
    │   ├─► Build main app & functions
    │   └─► Deploy to wizcol-app.web.app
    │
    └─► Vercel Production Workflow
        ├─► Validate mass-consensus
        ├─► Build mass-consensus
        └─► Deploy to production URL
```

---

## Troubleshooting

### Firebase Deployment Fails

1. **Service account issues**:
   ```bash
   # Test locally
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   firebase deploy --only hosting:wizcol
   ```

2. **Target not found**:
   ```bash
   firebase target:apply hosting wizcol wizcol-app
   ```

3. **Permission denied**:
   - Ensure service account has Firebase Admin role
   - Check project ID matches

### Vercel Deployment Fails

1. **Build errors**:
   ```bash
   cd apps/mass-consensus
   npm run build
   ```

2. **Environment variables missing**:
   - Check Vercel dashboard for all required variables
   - Ensure `FIREBASE_PRIVATE_KEY` includes the full key with newlines

3. **Root directory issues**:
   - Verify root directory is set to `apps/mass-consensus`

### Preview Channel Not Created

1. Check GitHub token permissions in workflow
2. Verify `FIREBASE_SERVICE_ACCOUNT_WIZCOL` is correct
3. Check Firebase Hosting is enabled for the project

---

## Security Notes

1. **Never commit secrets** to the repository
2. **Rotate tokens** periodically
3. **Use environment-specific variables** for production vs preview
4. **Review PR previews** before merging sensitive changes

---

## Local Development

### Main App
```bash
npm run dev
```

### Mass Consensus
```bash
cd apps/mass-consensus
npm run dev
```

### Full Stack (with emulators)
```bash
# Terminal 1: Firebase emulators
firebase emulators:start

# Terminal 2: Main app
npm run dev

# Terminal 3: Mass consensus
cd apps/mass-consensus
npm run dev
```

---

## Quick Reference

### Deploy Main App Manually
```bash
firebase use wizcol
npm run build
firebase deploy --only hosting:wizcol
```

### Deploy Functions Manually
```bash
firebase use wizcol
cd functions && npm run build && cd ..
firebase deploy --only functions
```

### Deploy Mass Consensus Manually
```bash
cd apps/mass-consensus
npx vercel --prod
```
