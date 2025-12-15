# Sign App Architecture

This document provides a comprehensive overview of the Sign application architecture.

## Overview

The Sign app is a **Next.js 14** application for digital document signing and deliberation. It enables users to sign documents, approve/reject paragraphs, leave comments, and view engagement metrics through heat maps.

**Key Goal:** Provide a streamlined interface for document deliberation with granular paragraph-level interactions.

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router, SSR) |
| State Management | Zustand |
| Database | Firebase Firestore |
| Authentication | Firebase Auth |
| Rich Text | TipTap 3.13 |
| Styling | SCSS Modules |
| i18n | @freedi/shared-i18n |
| External API | Google Docs API |

## Directory Structure

```
/apps/sign
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── admin/                # Admin operations
│   │   ├── approvals/            # Paragraph approvals
│   │   ├── auth/                 # Authentication
│   │   ├── comments/             # Comment threads
│   │   ├── demographics/         # Survey system
│   │   ├── evaluations/          # Comment ratings
│   │   ├── heatmap/              # Heat map data
│   │   ├── import/               # Google Docs import
│   │   ├── signatures/           # Document signing
│   │   └── views/                # View tracking
│   ├── doc/[statementId]/        # Document pages
│   │   ├── admin/                # Admin dashboard
│   │   │   ├── settings/         # Document settings
│   │   │   └── users/            # User list
│   │   ├── page.tsx              # Main signing view
│   │   └── layout.tsx
│   ├── login/                    # Authentication
│   ├── layout.tsx                # Root layout
│   └── globals.scss              # Global styles
│
├── src/
│   ├── components/               # React components
│   │   ├── admin/               # Admin UI
│   │   ├── comments/            # Comment threads
│   │   ├── demographics/        # Survey UI
│   │   ├── document/            # Document view
│   │   ├── heatMap/             # Heat map visualization
│   │   ├── import/              # Google Docs import
│   │   ├── paragraph/           # Paragraph interactions
│   │   └── shared/              # Button, Modal, Avatar
│   │
│   ├── hooks/                    # Custom hooks
│   │   ├── useHeatMap.ts        # Heat map logic
│   │   └── useViewportTracking.ts
│   │
│   ├── lib/                      # Core logic
│   │   ├── firebase/            # Firebase integration
│   │   ├── google-docs/         # Google Docs API
│   │   └── utils/               # Utilities
│   │
│   ├── store/                    # Zustand stores
│   │   ├── uiStore.ts           # UI state
│   │   ├── heatMapStore.ts      # Heat map config
│   │   └── demographicStore.ts  # Survey state
│   │
│   └── types/                    # TypeScript types
│
├── next.config.js               # Next.js config
└── package.json                 # Dependencies
```

## Key Features

### 1. Document Signing

Three signature statuses:
- `signed` - User approves the document
- `rejected` - User rejects the document
- `viewed` - User has viewed but not decided

```typescript
interface Signature {
  signatureId: `${userId}--${docId}`;
  documentId: string;
  userId: string;
  signed: 'signed' | 'rejected' | 'viewed';
  date: number;
  levelOfSignature: number;
}
```

**Rules:**
- Cannot downgrade from `signed`/`rejected` to `viewed`
- Each user has one signature per document
- Animated sign button with confetti on success

### 2. Paragraph Approvals

Individual paragraph-level approvals:

```typescript
interface Approval {
  approvalId: `${userId}--${paragraphId}`;
  paragraphId: string;
  documentId: string;
  userId: string;
  approval: boolean;  // true = approve, false = reject
  createdAt: number;
}
```

- One approval per user per paragraph
- Real-time approval count aggregation
- Toggle approval/rejection

### 3. Comment Threads

Comment system per paragraph:

```typescript
interface Comment {
  commentId: string;
  paragraphId: string;
  documentId: string;
  userId: string;
  content: string;
  createdAt: number;
  evaluations: {
    support: number;
    oppose: number;
  };
}
```

- One comment per user per paragraph
- Comment evaluations (support/oppose)
- Edit/delete own comments

### 4. Heat Maps

Visualize engagement metrics across paragraphs:

| Type | Description | Scale |
|------|-------------|-------|
| Approval | Approval/rejection rate | -1 to +1 |
| Comments | Comment activity | Count |
| Rating | Average evaluation scores | 0 to 5 |
| Viewership | % users who viewed 5+ seconds | 0-100% |

```typescript
interface HeatMapData {
  approval: Record<paragraphId, number>;
  comments: Record<paragraphId, number>;
  rating: Record<paragraphId, number>;
  viewership: Record<paragraphId, number>;
}
```

### 5. Viewership Tracking

Track paragraph visibility:

- Uses IntersectionObserver
- Requires 5+ seconds in viewport
- De-duplicates per user/paragraph
- Updates duration on repeated views

```typescript
// useViewportTracking hook
function useViewportTracking(paragraphId: string) {
  const elementRef = useRef<HTMLElement>(null);
  const timeInView = useRef(0);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        startTimer();
      } else {
        stopTimer();
        if (timeInView.current >= 5000) {
          recordView(paragraphId);
        }
      }
    });

    observer.observe(elementRef.current!);
    return () => observer.disconnect();
  }, [paragraphId]);
}
```

### 6. Demographics/Survey

Optional survey system:

```typescript
interface SignDemographicQuestion {
  questionId: string;
  question: string;
  type: 'text' | 'single' | 'multiple';
  options?: string[];
  required: boolean;
}

interface DemographicStatus {
  isLoaded: boolean;
  mode: 'disabled' | 'inherit' | 'custom';
  isRequired: boolean;
  isComplete: boolean;
}
```

- Can inherit from parent document
- Required or optional completion
- Blocks interaction until complete (if required)

### 7. Google Docs Import

Import documents from Google Docs:

```typescript
// Convert Google Docs to paragraphs
async function convertGoogleDoc(docId: string): Promise<Paragraph[]> {
  const doc = await googleDocsClient.get(docId);

  return doc.body.content.map((element) => ({
    paragraphId: generateId(),
    type: mapGoogleType(element.paragraphStyle),
    content: extractText(element),
    order: index,
  }));
}
```

## Component Architecture

### Server/Client Split

**Server Components:**
- Document page data fetching
- User verification
- Initial paragraph loading

**Client Components:**
- `DocumentClient` - Main interactive container
- `ParagraphCard` - Individual paragraph
- `InteractionBar` - Approve/reject/comment
- `CommentThread` - Comment modal
- `HeatMapProvider` - Heat map context

### Component Hierarchy

```
DocumentView (Server)
  └── DocumentClient (Client)
      ├── TopBar
      │   ├── Logo
      │   ├── AdminButton
      │   └── UserAvatar
      ├── DocumentHeader
      │   ├── Title
      │   └── ProgressBar
      ├── ParagraphList
      │   └── ParagraphCard[]
      │       ├── ParagraphHeading
      │       ├── ParagraphContent
      │       └── InteractionBar
      │           ├── ApproveButton
      │           ├── RejectButton
      │           ├── CommentButton
      │           └── HeatMapBadge
      ├── HeatMapProvider
      │   ├── HeatMapLegend
      │   └── HeatMapToolbar
      ├── Modals
      │   ├── LoginModal
      │   ├── CommentThread
      │   ├── DemographicSurveyModal
      │   └── SignatureModal
      └── SignButton (Footer)
```

## State Management (Zustand)

### Three Stores

#### UIStore

```typescript
interface UIStore {
  // Modal management
  activeModal: ModalType | null;
  modalContext: { paragraphId?: string; documentId?: string };
  openModal: (modal: ModalType, context?: ModalContext) => void;
  closeModal: () => void;

  // Edit mode
  isEditMode: boolean;
  setEditMode: (enabled: boolean) => void;

  // View mode
  viewMode: 'default' | 'views' | 'support' | 'importance';

  // Table of contents
  isTocExpanded: boolean;
  toggleToc: () => void;
  activeParagraphId: string | null;

  // Loading states
  isSubmitting: boolean;
  setSubmitting: (submitting: boolean) => void;

  // Animation state
  signingAnimationState: 'idle' | 'signing' | 'success' | 'error';

  // Real-time data
  approvals: Record<paragraphId, boolean>;
  commentCounts: Record<paragraphId, number>;
  userInteractions: Set<paragraphId>;
}
```

#### HeatMapStore

```typescript
interface HeatMapStore {
  config: {
    type: 'approval' | 'comments' | 'rating' | 'viewership' | 'none';
    isEnabled: boolean;
    showBadges: boolean;
    showLegend: boolean;
  };

  data: HeatMapData;
  isLoading: boolean;
  error: string | null;
  documentId: string;

  loadHeatMapData: (documentId: string) => Promise<void>;
  setConfig: (config: Partial<HeatMapConfig>) => void;
}
```

#### DemographicStore

```typescript
interface DemographicStore {
  status: DemographicStatus;
  questions: SignDemographicQuestion[];
  currentAnswers: Record<questionId, string | string[]>;
  submittedAnswers: QuestionWithAnswer[];

  isSurveyModalOpen: boolean;
  isSubmitting: boolean;
  error: string | null;

  fetchStatus: (documentId: string) => Promise<void>;
  fetchQuestions: (documentId: string) => Promise<void>;
  submitAnswers: (documentId: string, answers: Answers) => Promise<void>;
}
```

## API Routes

### Endpoint Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/signatures/[docId]` | GET/POST | Get/create signature |
| `/api/approvals/[paragraphId]` | GET/POST/DELETE | Manage approvals |
| `/api/comments/[paragraphId]` | GET/POST | Get/create comments |
| `/api/evaluations/[commentId]` | POST | Rate comments |
| `/api/heatmap/[docId]` | GET | Aggregate metrics |
| `/api/views/[paragraphId]` | GET/POST | Track views |
| `/api/demographics/status/[docId]` | GET | Survey status |
| `/api/demographics/questions/[docId]` | GET | Get questions |
| `/api/demographics/answers/[docId]` | GET/POST | Get/submit answers |
| `/api/admin/stats/[docId]` | GET | Dashboard stats |
| `/api/admin/settings/[docId]` | GET/POST | Document config |
| `/api/admin/export/[docId]` | GET | Export data |
| `/api/import/google-docs` | POST | Import document |

### Heat Map Aggregation

```typescript
// /api/heatmap/[docId]/route.ts
export async function GET(req: Request, { params }) {
  const { docId } = params;

  // Aggregate all metrics
  const [approvals, comments, ratings, views] = await Promise.all([
    aggregateApprovals(docId),
    aggregateComments(docId),
    aggregateRatings(docId),
    aggregateViews(docId),
  ]);

  const heatMapData: HeatMapData = {
    approval: calculateApprovalRates(approvals),
    comments: countByParagraph(comments),
    rating: calculateAverageRatings(ratings),
    viewership: calculateViewershipPercent(views),
  };

  return NextResponse.json(heatMapData);
}
```

## Data Models

### Paragraph Structure

```typescript
interface Paragraph {
  paragraphId: string;
  type: ParagraphType;  // h1-h6, paragraph, li, table
  content: string;
  order: number;
  isNonInteractive?: boolean;  // Can't interact
}

type ParagraphType =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'paragraph'
  | 'li'
  | 'table';
```

### Document with Settings

```typescript
interface StatementWithParagraphs extends Statement {
  paragraphs?: Paragraph[];
  signSettings?: {
    textDirection: 'auto' | 'ltr' | 'rtl';
    logoUrl: string;
    brandName: string;
    enableComments: boolean;
    enableApprovals: boolean;
    enableHeatMap: boolean;
  };
}
```

## Collections

| Collection | Purpose |
|------------|---------|
| `statements` | Documents & paragraphs |
| `signatures` | Document signatures |
| `approval` | Paragraph approvals |
| `evaluations` | Comment ratings |
| `paragraphViews` | View tracking |
| `demographics*` | Survey data |

## Firebase Integration

### Queries (lib/firebase/queries.ts)

```typescript
// Get document with paragraphs
export async function getDocumentForSigning(statementId: string): Promise<StatementWithParagraphs>

// Get paragraphs
export async function getParagraphsFromStatement(statementId: string): Promise<Paragraph[]>

// Get user signature
export async function getUserSignature(userId: string, docId: string): Promise<Signature | null>

// Get comment counts
export async function getCommentCounts(docId: string): Promise<Record<string, number>>

// Get user approvals
export async function getUserApprovals(userId: string, docId: string): Promise<Record<string, boolean>>
```

## Security

### Authentication

1. **Google OAuth**: Full Firebase authentication
2. **Anonymous**: Session-based temporary access
3. **Cookies**: `userId` + `displayName` (30-day expiry)

### Authorization Pattern

```typescript
// Server-side user verification
function getUserFromRequest(req: Request): string | null {
  const cookies = parseCookies(req.headers.get('cookie'));
  return cookies.userId || null;
}

// Admin verification
async function verifyAdmin(userId: string, docId: string): Promise<boolean> {
  const subscription = await getSubscription(userId, docId);
  return subscription?.role === 'admin';
}
```

### Security Headers

```javascript
// next.config.js
headers: [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]
```

## Styling

### Global CSS Variables

```scss
// app/globals.scss
:root {
  // Core colors
  --btn-primary: #5f88e5;
  --text-body: #3d4d71;
  --card-default: #ffffff;
  --background: #f7fafc;

  // Heat map colors (5 levels each)
  --heat-approval-1: #ff6b6b;
  --heat-approval-2: #ffa07a;
  --heat-approval-3: #ffd700;
  --heat-approval-4: #90ee90;
  --heat-approval-5: #4caf50;

  // Semantic
  --agree: #4caf50;
  --disagree: #f44336;
}
```

### CSS Modules

```typescript
// Component example
import styles from './ParagraphCard.module.scss';

const ParagraphCard: FC<Props> = ({ paragraph }) => (
  <div className={styles.card}>
    <div className={styles.content}>{paragraph.content}</div>
    <div className={styles.interactions}>
      <InteractionBar />
    </div>
  </div>
);
```

## Routing

```
/                           → Redirect to /login
/login                      → Authentication

/doc/[statementId]
  /                         → Main signing view (SSR)
  /admin                    → Dashboard
  /admin/settings           → Document configuration
  /admin/users              → User list

/api/...                    → API endpoints
```

## Integration with Main App

### Shared Dependencies

- `delib-npm` - Core types (Statement, Collections)
- `@freedi/shared-i18n` - Localization
- Firebase project - Same Firestore database

### Independence

- Deployable separately on different domain/port
- Accessible via document IDs from main app
- Own authentication flow

## Environment Configuration

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=

# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_MAIN_APP_URL=http://localhost:5173
```

## Key Design Decisions

1. **Server-Side Rendering**: Main page uses RSC for SEO/performance
2. **Zustand for State**: Lightweight, no boilerplate
3. **Paragraph-Level Interactions**: Granular engagement tracking
4. **Heat Map Visualization**: Real-time engagement metrics
5. **Viewership Tracking**: 5+ second threshold for meaningful views
6. **Google Docs Integration**: Easy document import

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/doc/[statementId]/page.tsx` | Main document page |
| `src/store/uiStore.ts` | UI state management |
| `src/store/heatMapStore.ts` | Heat map configuration |
| `src/lib/firebase/queries.ts` | Firestore queries |
| `src/hooks/useHeatMap.ts` | Heat map logic |
| `src/hooks/useViewportTracking.ts` | View tracking |
| `src/components/paragraph/` | Paragraph components |
