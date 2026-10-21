# WizCol Class (apps/join-class): student first-load performance

Budget source: IA `docs/ia/agora-classroom.md` section 9b (first screen <= 300 kB gzipped, one Hebrew font, no autoplay,
tested on slow 4G + 4x CPU and on one real low-end Android). Measured 2026-10-21 on branch `feat/join-class-projector`
(Join copy + projector; the other classroom lanes add student screens on top of this, so re-measure after the merge).

## Gate (CI)

`npm run build && npm run perf:gate` in `apps/join-class` (also a step of `.github/workflows/join-class.yml`).

| Check | Rule | Today |
|---|---|---|
| Student entry, gzip -9 | <= `BUDGET_GZIP_BYTES` = 341,100 B (ratchet = measured + 2 %); **target 300,000 B** | **334.4 kB** (over the 300 kB target by 34.4 kB, 11 %) |
| Font families in built CSS | 1 | 1 (`Assistant`) |
| `autoplay` anywhere in `src/` and `dist/` | none | none |

"Student entry" = what the HTML loads before the first screen: the entry module, every module it preloads, the entry CSS
and the default (Hebrew) locale chunk.

| File | gzip |
|---|---|
| `firebase-*.js` (auth + firestore + functions + database SDK) | 172.8 kB |
| `index-*.js` (app, router, en dictionary, Mithril) | 131.6 kB |
| `index-*.css` | 20.4 kB |
| `he-*.js` (default locale) | 9.6 kB |
| **Total** | **334.4 kB** |

The budget is a ratchet on purpose: failing CI on day one would only teach people to raise the number. Lower
`BUDGET_GZIP_BYTES` every time a size idea below lands, until it equals `TARGET_GZIP_BYTES`.

Lazy chunks (not in the student entry): `sentryClient` 25.1 kB gz (deferred), `browser` 10.1 kB, locale chunks 8.7-9.8 kB gz
each, `TeacherProjector` 4.2 kB (teacher only), `PlanScreen` 3.9 kB.

## Slow-4G + 4x CPU run of `/c/:code`

`node scripts/perf-throttle.mjs --dist=<dir> --runs=5`: Chromium, CDP `Network.emulateNetworkConditions` (Lighthouse "slow
4G": 1.6 Mbps down, 750 kbps up, 150 ms RTT) and `Emulation.setCPUThrottlingRate` 4, cold cache, service worker blocked,
390 x 800 viewport, dist served with gzip. Median of 5 (macOS laptop, emulators on localhost):

| Metric | Median | Notes |
|---|---|---|
| FCP | **1.04 s** | the inline boot splash in `index.html`; paints before any JS |
| LCP | **1.04 s** | same element (the splash), so it says nothing about the app |
| Content ready ("TTI-ish") | **2.95 s** | splash replaced by the resolved code screen (anonymous sign-in + one Firestore read done) |
| Transferred up to content ready | **420 kB** | JS + CSS + the Latin and Hebrew font subsets + HTML |

Run-to-run spread was 2.90-3.23 s. Caveats, so nobody quotes this as the truth for a classroom: the Firebase emulators run on
localhost behind the same throttle (a real round trip to `me-west1` adds latency per request: anonymous sign-up and the
`classCodes/{code}` read are two sequential ones); a laptop at 4x slowdown is still faster than a 2019 budget Android; the
code screen resolves to "unknown code" for a code that does not exist, which is the same two requests as a real one.
**Test once on a real low-end Android before the next teachers' test (Tal's hands).** Use the same page, slow 4G preset in
Chrome remote debugging, and write the numbers into this table.

## Biggest chunks and how to reach 300 kB (need to shed ~35 kB gz)

1. **Split the Firebase SDK (largest lever, about 172 kB gz).** `lib/firebase.ts` imports app, auth, firestore, functions and
   database eagerly. A student's first screen needs auth + firestore only. Move `firebase/functions` (callables fire on a
   click) and `firebase/database` (live drafts, optional) behind dynamic `import()` the first time they are used, and
   measure whether Firestore Lite for the code lookup (`/c/:code` does one `getDoc`) before the full SDK loads is worth it.
   Expected: 25-40 kB gz, enough on its own. Unmeasured: do it as a spike and read `perf:gate`.
2. **Do not ship the app a student does not open on `/c/:code`.** `index-*.js` (131.6 kB gz) still holds Join's hub, solutions,
   chat and facilitator code. Make `MainHub`, `Solutions`, `Chat` and the facilitator panel route-level lazy imports (the
   teacher views already are), and make the English dictionary a lazy chunk like the other six (`he` is the default and
   English is inlined today, about 9 kB gz). Expected: 20-35 kB gz off the entry.
3. **Trim the entry CSS (20.4 kB gz).** Join's `_components.scss` carries hub, solution-card and facilitator styles; move
   them next to the lazy views (the way `teacher.scss` and `projector.scss` are imported from their views). Expected: 6-10
   kB gz, and fewer render-blocking bytes, which helps FCP on the real device more than the number suggests.

Not worth doing: shaving the font (one family, two subsets, preloaded, already the smallest practical set).

## Reproduce

```
cd apps/join-class
npm run build && npm run perf:gate
VITE_EMULATOR_AUTH_PORT=9135 VITE_EMULATOR_FIRESTORE_PORT=8135 VITE_EMULATOR_DATABASE_PORT=9035 \
  npx vite build --outDir /tmp/join-class-perf
node scripts/perf-throttle.mjs --dist=/tmp/join-class-perf --runs=5   # emulators must be running
```
