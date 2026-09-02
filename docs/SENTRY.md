# Sentry across the Freedi apps

## Which app reports where

Every browser app now initialises Sentry and tags each event with `app`, so a
shared project can still be split by app in the Sentry UI.

| App | Stack | DSN env var (preferred → fallback) | `app` tag |
|---|---|---|---|
| main | Vite / React | `VITE_SENTRY_DSN_MAIN` → `VITE_SENTRY_DSN` | `main` |
| sign | Next.js | `NEXT_PUBLIC_SENTRY_DSN` | `sign` |
| mass-consensus | Next.js | `NEXT_PUBLIC_SENTRY_DSN` | `mass-consensus` |
| join | Vite | `VITE_SENTRY_DSN` | `join` |
| chat | SvelteKit | `PUBLIC_SENTRY_DSN` | `chat` |
| admin | Vite / Mithril | `VITE_SENTRY_DSN_ADMIN` → `VITE_SENTRY_DSN` | `admin` |
| agora | Vite / Mithril | `VITE_SENTRY_DSN_AGORA` → `VITE_SENTRY_DSN` | `agora` |
| flow | Vite / Mithril | `VITE_SENTRY_DSN_FLOW` → `VITE_SENTRY_DSN` | `flow` |
| odyssey | Vite / React | `VITE_SENTRY_DSN_ODYSSEY` → `VITE_SENTRY_DSN` | `odyssey` |
| studio | Vite / React | `VITE_SENTRY_DSN_STUDIO` → `VITE_SENTRY_DSN` | `studio` |

### The project-per-app split (still to do, Sentry side)

As of 2026-09-02 the DSN `.../4510664509292624` is configured in **three**
places at once:

- `env/.env.prod` `SENTRY_DSN` — the **main app** (`app.wizcol.com`)
- `apps/sign/.env.local` `NEXT_PUBLIC_SENTRY_DSN` — **sign** (`sign.wizcol.com`)
- `apps/join/.env.local` `VITE_SENTRY_DSN` — **join**

That is why issues on main-app routes (`/statement/:id/accepted`,
`/statement-screen/:id/mind-map`, `/login`) appear in Sentry filed under
`wizcol-sign`. Nothing in the code can fix this — the projects have to be
created in Sentry, then the per-app env vars above pointed at them. Until that
happens, filter by the `app` tag.

Chunk names disambiguate historical events, from before the tags existed:

- `vendor-firebase-*.js` → main app
- `assets/firebase-*.js` → join, admin, agora
- `_next/static/**` → sign, mass-consensus

## Adding Sentry to a new Vite app

```ts
// src/lib/sentry.ts
import * as Sentry from '@sentry/browser';
import { buildSentryOptions, isUsableDsn, setErrorReporter, type LogContext }
  from '@freedi/shared-utils';

export function initSentry(): void {
  const dsn = (import.meta.env.VITE_SENTRY_DSN_MYAPP as string | undefined)
    || (import.meta.env.VITE_SENTRY_DSN as string | undefined);
  if (!import.meta.env.PROD || !isUsableDsn(dsn)) return;

  Sentry.init(buildSentryOptions<Sentry.ErrorEvent>({
    dsn,
    app: 'myapp',
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    firebaseChunkNames: ['firebase-'], // only if vite manualChunks names one
  }));

  setErrorReporter((error, context: LogContext) => {
    Sentry.captureException(error, { /* … */ });
  });
}
```

Call `initSentry()` as the first statement of the entry point, before auth or
mounting, so boot-time crashes are captured. Add `'myapp'` to `FreediApp` in
`packages/shared-utils/src/sentryOptions.ts`, plus the vite alias and tsconfig
path for `@freedi/shared-utils`.

## What is filtered, and why

All the policy lives in `packages/shared-utils/src/sentryOptions.ts` and
`sentryFilters.ts` — one place, because three hand-copied versions drifted and
two apps ended up with no Firestore filter at all.

- **Firestore internal crashes** (`INTERNAL ASSERTION FAILED (ID: b815)` and the
  null-dereference variants). Raised inside the minified SDK when its local
  persistence layer breaks; not fixable from app code and repeats dozens of
  times per bad session.

  These arrive as a **chained** exception — an outer `FirebaseError` wrapping
  the inner SDK `TypeError`. The filter judges each exception value on *its own*
  frames. Flattening every value's frames into one array and asking whether they
  are all vendor frames, as the first version did, always found the outer value's
  app frames and never fired.

- **workbox-window null dereference**, from a stubbed `serviceWorker.register()`
  (privacy extensions, automation harnesses).

- **`auth/network-request-failed`** — offline, flaky mobile networks, or an
  ad-blocker blocking `identitytoolkit.googleapis.com`.

- The shared `ignoreErrors` list: browser-extension noise, connectivity, IndexedDB
  in private mode, Firestore offline.

Each filter requires the stack to be rooted in the third-party bundle it names,
so app code producing a similar message is still reported.

## The Firebase SDK version

`firebase` is declared `^11.0.2` everywhere and resolves to **11.10.0**, which
is the newest release on the 11.x line — there is no 11.x patch to move to for
the b815 family. The only upgrade available is **firebase 12.x**, a major
version across nine apps plus Cloud Functions. That is its own piece of work,
not a Sentry fix, and it is not needed now that the filter works.
