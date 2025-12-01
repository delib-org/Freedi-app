# Multi-Environment MC Deployment Plan

## Goal
Set up two separate MC (mass-consensus) deployments on Vercel:
1. **Testing**: `mass-consensus-staging.vercel.app` → `freedi-test` Firebase
2. **Production**: `mc.wizcol.app` → `wizcol-app` Firebase

And configure the main Freedi app to automatically connect to the correct MC environment.

## Implementation Status

### Code Changes (Completed)

| File | Change | Status |
|------|--------|--------|
| `src/controllers/db/config.ts` | Updated `getMassConsensusUrl()` to use env variable with auto-detect fallback | Done |
| `env/.env.dev` | Added `VITE_APP_MASS_CONSENSUS_URL=http://localhost:3001` | Done |
| `env/.env.test` | Added `VITE_APP_MASS_CONSENSUS_URL=https://mass-consensus-staging.vercel.app` | Done |
| `env/.env.wizcol` | Added `VITE_APP_MASS_CONSENSUS_URL=https://mc.wizcol.app` | Done |
| `apps/mass-consensus/.env.staging` | Created new staging environment file | Done |

### Manual Steps (Required in Vercel Dashboard)

1. **Create new Vercel project for staging:**
   - Project name: `mass-consensus-staging`
   - Link to GitHub repo: `Freedi-app`
   - Root directory: `apps/mass-consensus`
   - Framework: Next.js

2. **Configure staging environment variables in Vercel:**
   Copy from `apps/mass-consensus/.env.staging`, plus add secrets:
   - `FIREBASE_CLIENT_EMAIL` (from freedi-test service account)
   - `FIREBASE_PRIVATE_KEY` (from freedi-test service account)

3. **Disable auto-deployment for staging** (deploy manually when needed)

---

## Environment Matrix (Final State)

| Environment | Freedi URL | MC URL | Firebase |
|-------------|-----------|--------|----------|
| **Local Dev** | localhost:5173 | localhost:3001 | freedi-test (emulator) |
| **Testing** | freedi-test.web.app | mass-consensus-staging.vercel.app | freedi-test |
| **Production** | wizcol.app | mc.wizcol.app | wizcol-app |

---

## How It Works

### `getMassConsensusUrl()` Logic (Priority Order)
1. **Environment variable** - If `VITE_APP_MASS_CONSENSUS_URL` is set, use it
2. **Development mode** - If not production, return `http://localhost:3001`
3. **Auto-detect** - In production, detect from hostname:
   - `*.wizcol.*` → `https://mc.wizcol.app`
   - `freedi-test.*` or `*staging*` → `https://mass-consensus-staging.vercel.app`
   - Default → `https://mc.wizcol.app`

---

## Deployment Commands

### Staging MC (Manual)
```bash
cd apps/mass-consensus
vercel --env-file .env.staging
```

### Production MC (Automatic via GitHub Actions)
Automatically deploys when pushing to `main` branch with changes in `apps/mass-consensus/`

### Freedi App
```bash
npm run deploy test    # Deploy to freedi-test.web.app
npm run deploy wizcol  # Deploy to wizcol.app
```

---

## Testing Checklist

- [ ] Deploy staging MC to Vercel
- [ ] Test staging: Visit `mass-consensus-staging.vercel.app/q/{testStatementId}`
- [ ] Verify it reads from `freedi-test` Firestore
- [ ] Deploy Freedi to `freedi-test.web.app` with `npm run deploy test`
- [ ] Verify email notifications use staging MC URL
- [ ] Verify production still uses `mc.wizcol.app`
