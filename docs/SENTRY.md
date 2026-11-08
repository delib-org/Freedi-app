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

## Nothing reports from a developer's machine

`isLocalRuntime()` in `packages/shared-utils/src/isLocalRuntime.ts` is the guard,
and **every** `Sentry.init()` in the repo is behind it.

A build flag alone was not enough. `import.meta.env.PROD` and
`NODE_ENV === 'production'` answer "was this bundle built for production", which
is a different question from "is this running on a developer's laptop", and the
gap let four paths report locally:

| path | why the build flag said production |
|---|---|
| Cloud Functions in the emulator | `functions/.env` carries the real `SENTRY_DSN` so `deploy:f:*` has one, and the emulator loads that same file |
| chat SSR in the emulator | the `ssrChat` bundle is built once, with `PROD` baked in, and then runs locally |
| `vite preview` | serves a production build from localhost |
| `next start` | `NODE_ENV` is `production` there too |

The 2026-09-06 `DEADLINE_EXCEEDED` issue in `agora.onProposalWritten` came from
the first row: a wedged local Firestore emulator, filed into the production
project as `environment: development`.

The guard only trusts signals a deployment cannot produce:

- a browser served from loopback, `.local`, or `.localhost`;
- any `*_EMULATOR*` variable in the environment;
- `NODE_ENV` of `development` or `test`;
- a Node process with **no** deployment marker — Cloud Run sets `K_SERVICE`, the
  functions framework sets `FUNCTION_TARGET`, Vercel sets `VERCEL`.

That last one is the only inferential check, so if a new server target ever ships
without one of those markers, its Sentry would go quiet. Set
`SENTRY_ENABLE_IN_LOCAL=true` (or `VITE_SENTRY_ENABLE_IN_LOCAL=true` in a Vite
app, whose env is inlined at build time and so has to be forwarded explicitly) to
report from a local run on purpose.

`functions/src/utils/sentry.ts` and `apps/chat/src/lib/sentry.ts` carry their own
copies rather than importing this one: functions/ installs shared packages as
packed tarballs, and chat's server bundle is externalised by adapter-node, so
anything it imports must also exist in `functions/package.json`. Keep the three
in step.

## Adding Sentry to a new Vite app

```ts
// src/lib/sentry.ts
import * as Sentry from '@sentry/browser';
import { buildSentryOptions, isLocalRuntime, isUsableDsn, setErrorReporter,
  type LogContext } from '@freedi/shared-utils';

export function initSentry(): void {
  const dsn = (import.meta.env.VITE_SENTRY_DSN_MYAPP as string | undefined)
    || (import.meta.env.VITE_SENTRY_DSN as string | undefined);
  const override = import.meta.env.VITE_SENTRY_ENABLE_IN_LOCAL === 'true';
  if (isLocalRuntime(override) || !import.meta.env.PROD || !isUsableDsn(dsn)) return;

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
