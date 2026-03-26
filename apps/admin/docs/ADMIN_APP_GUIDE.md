# Freedi Admin Dashboard - Architecture & Goals

> This document is written for AI assistants (Claude, etc.) working on the admin app.
> It captures the goals, architecture, technology choices, patterns, and conventions
> so you can contribute effectively without re-exploring the codebase each time.

---

## 1. Purpose & Goals

The admin dashboard is the **system-wide operations console** for the Freedi platform. Its users are platform operators (not discussion admins) who need to:

- **Monitor platform health** - see activity trends, spot anomalies, track growth
- **Understand usage patterns** - which statement types dominate, which apps drive traffic, how evaluations/votes trend over time
- **Manage users & admins** - browse user lists, understand admin distribution across discussions
- **Compare time periods** - daily real-time view for operational monitoring, monthly/yearly aggregated views for strategic decisions and growth tracking

The dashboard is intentionally **read-only**. It observes the platform but does not modify it. All writes happen through the main app, sign app, or cloud functions.

---

## 2. Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **UI Framework** | [Mithril.js](https://mithril.js.org/) v2 | Ultra-lightweight (< 10KB), fast, simple API. No virtual DOM diffing overhead. Perfect for a data-heavy dashboard that doesn't need React's ecosystem. |
| **Language** | TypeScript (strict mode) | Type safety across the codebase. Shares types with the rest of the monorepo via `@freedi/shared-types`. |
| **Backend** | Firebase (Firestore + Auth) | Same backend as the main app. No separate API layer needed - the dashboard reads directly from Firestore. |
| **Charts** | Custom SVG | No charting library dependency. Full control over rendering. Lightweight. The charts are simple enough (area, bar, stacked bar, horizontal bar) that a library would be overkill. |
| **Styling** | SCSS with BEM naming | CSS custom properties (design tokens) in `tokens.scss`. Component styles in `components.scss`. Global layout in `global.scss`. |
| **Build** | Vite | Fast dev server, optimized production builds. Firebase is manually chunked for caching. |
| **Dev Port** | 3005 | Avoids conflicts with main app (5173), sign (3002), MC (3001). |

---

## 3. Architecture

### 3.1 File Structure

```
src/
├── index.ts              # Mithril router + global style imports
├── views/                # Page-level components (one per route)
│   ├── DashboardView.ts  # KPI cards + charts + recent statements
│   ├── StatementsView.ts # Filterable, paginated statement browser
│   ├── UsersView.ts      # User list with type breakdown
│   └── AdminsView.ts     # Admin distribution across discussions
├── components/           # Reusable UI components
│   ├── Layout.ts         # Auth gate + sidebar + content wrapper
│   ├── Sidebar.ts        # Left navigation
│   ├── KpiCard.ts        # Metric card with gradient + optional trend
│   ├── TimeChart.ts      # Single-series (area/bar) + MultiTimeChart (stacked bar)
│   ├── MiniChart.ts      # Horizontal bar chart
│   ├── DataTable.ts      # Generic sortable table
│   ├── Badge.ts          # Colored pill labels
│   ├── Breadcrumb.ts     # Statement hierarchy trail
│   ├── FilterBar.ts      # Type dropdown + search input
│   ├── Pagination.ts     # "Load More" button
│   ├── PeriodToggle.ts   # Daily/Monthly/Yearly segmented control
│   └── Spinner.ts        # Loading indicator
├── state/                # State management modules
│   ├── dashboard.ts      # Dashboard data, listeners, period modes
│   ├── statements.ts     # Paginated statement list
│   ├── users.ts          # Paginated user list
│   └── admins.ts         # Admin distribution grouping
├── lib/                  # Utilities & services
│   ├── firebase.ts       # Firebase init, emulator connection, re-exports
│   ├── auth.ts           # Google auth + systemAdmin check
│   ├── queries.ts        # All Firestore queries, listeners, time-series helpers
│   ├── breadcrumb.ts     # Statement parent chain walker
│   ├── cache.ts          # In-memory statement cache (5min TTL, 500 max)
│   └── links.ts          # URL builder for main app links
└── styles/
    ├── tokens.scss       # CSS custom properties (colors, spacing, shadows)
    ├── global.scss       # Reset, layout grid, page header
    └── components.scss   # All component BEM styles
```

### 3.2 Data Flow

```
Firestore Collections ──► queries.ts (fetch/listen) ──► state/*.ts (process & store) ──► views/*.ts (render)
                                                              │
                                                              ▼
                                                         m.redraw() triggers Mithril re-render
```

### 3.3 Routes

| Path | View | Description |
|------|------|-------------|
| `/` | DashboardView | System analytics with KPIs, charts, period toggle |
| `/statements` | StatementsView | Browsable statement list with filters |
| `/users` | UsersView | User list with Google/Anonymous breakdown |
| `/admins` | AdminsView | Admin distribution by user across discussions |

---

## 4. Key Patterns

### 4.1 State Management

State is managed via **plain module-level objects** (no Redux, no stores). Each state module follows this pattern:

```typescript
// Internal mutable state
const state: SomeState = { /* initial values */ };

// Setup listeners
export function subscribe(): void { /* ... */ }

// Cleanup
export function unsubscribe(): void { /* ... */ }

// Read-only accessor
export function getState(): Readonly<SomeState> { return state; }
```

Views subscribe in `oninit()` and unsubscribe in `onremove()`. State mutations call `m.redraw()` to trigger re-renders.

### 4.2 Real-Time vs. Aggregated Data

The dashboard has **two data modes**:

1. **Daily (real-time)**: Uses `onSnapshot` listeners on raw collections (statements, evaluations, votes, subscriptions). Fetches up to 5000 docs and bucketizes client-side. Good for operational monitoring.

2. **Monthly/Yearly (aggregated)**: Reads from `adminStats` collection - pre-computed counters that cloud function triggers maintain. Each doc has a `total` count plus optional breakdowns (`byType`, `byApp`, `topLevel`). Reads ~48 docs instead of scanning entire collections.

The `setPeriodMode()` function in `dashboard.ts` handles the switch: it tears down all listeners and re-subscribes with the appropriate strategy.

### 4.3 Mithril Component Conventions

- Components are either **objects** (`{ view(vnode) {} }`) or **factory functions** returning objects
- Props via `vnode.attrs` with a typed `Attrs` interface
- Use `m('.class-name', ...)` for DOM elements (hyperscript syntax)
- Generic components use factory pattern: `const RecentTable = DataTable<Statement>()`
- Keys must be provided for list items to avoid vnode reuse issues

### 4.4 Chart Rendering

All charts are **custom SVG** with these shared constants:

- ViewBox width: 600 (height varies per chart)
- Padding: left=50 (y-axis labels), right=16, top=10, bottom=24 (x-axis labels)
- Y-axis: 5 ticks at 0%, 25%, 50%, 75%, 100% of max value
- X-axis: Smart label decimation (max ~6 labels + last date)
- Date formatting adapts to period: day="18/3", month="Mar 26", year="2026"

### 4.5 Authentication

- Google sign-in only (no email/password)
- Access requires `systemAdmin: true` on the user's Firestore document (`usersV2/{uid}`)
- `Layout.ts` enforces auth at the wrapper level - no view renders without it
- The login and access-denied screens are part of `Layout.ts`

### 4.6 Firebase Emulator Support

In development (localhost), the app auto-connects to:
- Auth emulator: `localhost:9099`
- Firestore emulator: `localhost:8081`

---

## 5. Firestore Collections Used

| Collection | Purpose | Access Pattern |
|-----------|---------|---------------|
| `statements` | Statement documents | Real-time listener (daily), count query |
| `evaluations` | Evaluation documents | Real-time listener (daily), count query |
| `votes` | Vote documents | Real-time listener (daily), count query |
| `statementsSubscribe` | User subscriptions | Real-time listener (daily), admin role queries |
| `usersV2` | User profiles | Paginated query, count, systemAdmin check |
| `adminStats` | Pre-computed KPI aggregates | Direct doc reads by ID (monthly/yearly) |

### adminStats Document Schema

```typescript
interface AdminStatDoc {
  collection: string;           // 'statements' | 'evaluations' | 'votes' | 'statementsSubscribe' | 'users'
  periodType: 'day' | 'month' | 'year';
  periodKey: string;            // 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'
  total: number;
  byType?: Record<string, number>;  // statements only
  byApp?: Record<string, number>;   // statements only
  topLevel?: number;                 // statements only (parentId === 'top')
  lastUpdate: number;               // milliseconds
}
```

Doc ID format: `{collection}_{periodKey}` (e.g., `statements_2026-03`, `votes_2026`).

These docs are maintained by cloud function triggers in `functions/src/fn_adminStats.ts`. Each document create/delete increments/decrements 3 stat docs (day + month + year) atomically. User counts are snapshotted daily at 00:10 UTC by a scheduled function.

---

## 6. Styling Conventions

- **BEM naming**: `.component`, `.component__element`, `.component--modifier`
- **Design tokens**: All colors, spacing, shadows defined as CSS custom properties in `tokens.scss`
- **Dark mode**: Supported via `@media (prefers-color-scheme: dark)` overrides in `tokens.scss`
- **Responsive**: Grid breakpoints at 700px, 900px, 1100px
- **No CSS modules**: Global SCSS with BEM is sufficient for this app's scale
- **No external CSS framework**: Everything is hand-written

### Color System

- **KPI gradients**: 5 named gradients (blue, teal, violet, rose, amber)
- **Badge colors**: 7 variants (blue, teal, violet, rose, amber, emerald, gray) with bg+text pairs
- **Chart colors**: 8 named colors for data visualization (mapped to statement types and source apps)
- **Sidebar**: Dark purple (#1E1B4B) with indigo accent (#818CF8)

---

## 7. Common Tasks

### Adding a new KPI card

1. Add the value to `DashboardState` interface and initial state in `state/dashboard.ts`
2. Populate it in the appropriate data-loading function (`loadCounts`, `processStatements`, or `loadAggregatedStats`)
3. Add a `KpiCard` element in `DashboardView.ts`

### Adding a new chart

1. Define the data shape (usually `DayBucket[]`) in the state
2. Populate it from either real-time listener (daily) or `fetchAdminStats` (monthly/yearly)
3. Use `TimeChart` (single series) or `MultiTimeChart` (multiple series) in the view
4. For new chart types, extend `TimeChart.ts` with a new variant

### Adding a new view/page

1. Create `src/views/NewView.ts` with Mithril component
2. Create `src/state/newState.ts` with subscribe/unsubscribe/getState pattern
3. Add route in `src/index.ts`
4. Add nav link in `src/components/Sidebar.ts`

### Adding a new Firestore collection to track

**For real-time (daily mode)**:
- Add a listener in `subscribeRealTime()` in `state/dashboard.ts`

**For aggregated (monthly/yearly mode)**:
- Add a `fetchAdminStats()` call in `loadAggregatedStats()` in `state/dashboard.ts`
- Ensure the cloud function triggers in `functions/src/fn_adminStats.ts` are wired for the new collection

---

## 8. Important Caveats

1. **Firestore Timestamp inconsistency**: Some docs store timestamps as Firestore `Timestamp` objects, others as plain millisecond numbers. The `toMillis()` helper in `queries.ts` handles both formats - always use it.

2. **No date-range queries**: The app avoids Firestore `where` range queries on timestamps because of Timestamp vs number type mismatches. Instead, it fetches ordered docs with `limit()` and filters client-side.

3. **5000 doc limit**: Real-time listeners cap at 5000 docs. This is fine for 30-day daily views but would not scale for monthly/yearly - hence the `adminStats` pre-computed approach.

4. **Admin check**: The `systemAdmin` field on the user doc controls access. This is separate from discussion-level admin roles.

5. **Mithril quirks**:
   - Always provide keys when rendering lists to avoid vnode reuse bugs
   - `m.redraw()` must be called after async state changes (Mithril doesn't auto-detect)
   - Component lifecycle: `oninit` (mount), `onremove` (unmount), `view` (render)

6. **No test coverage yet**: The app has vitest configured but no tests written. This is a known gap.

---

## 9. Dependencies on Other Packages

| Package | What's used |
|---------|-------------|
| `@freedi/shared-types` | `Collections` enum, `Statement` type, `StatementType` enum, `Role` enum, `AdminStatDoc` type, `getAdminStatDocId()` |
| `@freedi/engagement-core` | Listed as dependency but not directly used in admin app code (transitive through shared-types) |
| `firebase` | Firestore SDK, Auth SDK |
| `mithril` | UI framework |
| `sass` | SCSS compilation |

When `shared-types` changes, rebuild it (`cd packages/shared-types && npm run build`) before rebuilding the admin app.

---

## 10. Development Workflow

```bash
# Start dev server (with emulators)
cd apps/admin && npm run dev

# Type-check only
npm run typecheck

# Full build (typecheck + vite)
npm run build

# Lint
npm run lint
```

The app runs on `http://localhost:3005`. It expects Firebase emulators running on their default ports (auth: 9099, firestore: 8081) when in dev mode.
