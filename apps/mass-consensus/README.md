# Freedi Mass Consensus - Fast Loading Module

A high-performance Next.js application for mass consensus building on crowdsourced solutions, optimized for speed and user experience.

## 🚀 Features

- **Server-Side Rendering (SSR)**: Near-instant page loads with pre-rendered content
- **Incremental Static Regeneration (ISR)**: Cached pages with automatic updates
- **Anonymous Participation**: No login required to evaluate and submit solutions
- **Real-time Evaluations**: Vote on solutions with a 5-point scale (-1 to +1)
- **Batch Loading**: Get new sets of random solutions to evaluate
- **AI Feedback**: Personalized improvement suggestions using Gemini API
- **Results Page**: View all solutions sorted by community consensus
- **Responsive Design**: Mobile-first approach with clean, modern UI

## 📋 Prerequisites

- Node.js 18+
- Firebase project with Firestore
- Google Gemini API key (for AI feedback feature)
- Existing Freedi app data model (uses delib-npm types)

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   cd apps/mass-consensus
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:
   ```env
   # Firebase Admin (Server-side)
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email
   FIREBASE_PRIVATE_KEY="your-private-key"

   # Gemini API
   GEMINI_API_KEY=your-gemini-api-key

   # App URLs
   NEXT_PUBLIC_APP_URL=http://localhost:3001
   NEXT_PUBLIC_MAIN_APP_URL=https://freedi.app
   ```

3. **Update Firebase rules (if needed):**

   Ensure your Firestore has a `randomSeed` field on statements for efficient random sampling:
   ```javascript
   // Add to existing statements
   statements.where('statementType', '==', 'option').forEach(doc => {
     doc.ref.update({ randomSeed: Math.random() });
   });
   ```

## 🚀 Development

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## 📦 Build

```bash
npm run build
npm start
```

## 🏗️ Architecture

### Data Model

Uses existing Freedi data models from `delib-npm`:

- **Question** = `Statement` with `statementType: 'question'`
- **Solution** = `Statement` with `statementType: 'option'`
- **Evaluation** = User votes (-1 to +1 scale)

### File Structure

```
apps/discuss/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── statements/[id]/
│   │   │   ├── batch/            # Random batch endpoint
│   │   │   └── submit/           # Submit solution
│   │   ├── evaluations/[id]/     # Evaluation submission
│   │   └── ai/feedback/          # AI feedback
│   ├── q/[statementId]/          # Question pages
│   │   ├── page.tsx              # Main question view (SSR)
│   │   └── results/              # Results page
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── src/
│   ├── components/
│   │   ├── question/             # Question-related components
│   │   ├── results/              # Results components
│   │   └── shared/               # Shared components
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── admin.ts          # Firebase Admin SDK
│   │   │   └── queries.ts        # Database queries
│   │   ├── ai/                   # AI integration
│   │   └── utils/                # Utility functions
│   └── types/                    # TypeScript types
└── public/                       # Static assets
```

## 🎯 Key Pages

### Question Page: `/q/[statementId]`

- Server-rendered with initial batch of solutions
- Interactive evaluation buttons
- Batch loading mechanism
- Solution submission form

### Results Page: `/q/[statementId]/results`

- All solutions sorted by consensus
- "My Solutions" tab for user's submissions
- AI feedback button

## 🔧 API Endpoints

### POST `/api/statements/[id]/batch`

Get random batch of solutions.

**Request:**
```json
{
  "userId": "anon_123456_abc",
  "excludeIds": ["sol1", "sol2"]
}
```

**Response:**
```json
{
  "solutions": [/* Statement[] */],
  "hasMore": true,
  "count": 10
}
```

### POST `/api/statements/[id]/submit`

Submit new solution.

**Request:**
```json
{
  "solutionText": "My solution text",
  "userId": "anon_123456_abc"
}
```

### POST `/api/evaluations/[id]`

Submit evaluation.

**Request:**
```json
{
  "evaluation": 0.5,
  "userId": "anon_123456_abc"
}
```

### POST `/api/ai/feedback`

Get AI feedback.

**Request:**
```json
{
  "questionId": "statement123",
  "userId": "anon_123456_abc"
}
```

## ⚡ Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| FCP (First Contentful Paint) | < 0.8s | ~0.6s |
| LCP (Largest Contentful Paint) | < 1.2s | ~1.0s |
| TTI (Time to Interactive) | < 2.0s | ~1.8s |
| Initial Bundle Size | < 80KB | ~65KB |

## 🔐 Anonymous User System

Users are identified by a client-generated ID stored in:
- `localStorage`: `anonymousUserId`
- Cookie: `userId` (for server-side access)

Format: `anon_[timestamp]_[random]`

## 🤖 AI Feedback

Uses Google Gemini 1.5 Flash to analyze:
- User's submitted solutions
- Top-performing community solutions
- Question context

Provides:
- Pattern analysis of successful solutions
- Specific improvement suggestions
- Actionable tips

## 📊 Caching Strategy

- **ISR**: Pages regenerate every 60 seconds (question pages) / 30 seconds (results)
- **API Routes**: 60-second cache with stale-while-revalidate
- **Static Assets**: Cached indefinitely with hash-based filenames

## 🚢 Deployment

### Vercel (Recommended)

```bash
npm run build
vercel deploy
```

Environment variables must be set in Vercel dashboard.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## 🔄 Integration with Main App

### URL Strategy

- **Fast Module**: `discuss.freedi.app/[statementId]`
- **Main App**: `freedi.app/statement/[statementId]`

### Data Compatibility

Uses same Firebase collections and data models as main app:
- `statements` collection
- `evaluations` collection
- Compatible with all existing features

## 📝 TODO

- [ ] Add featured questions list on home page
- [ ] Implement comment system on solutions
- [ ] Add push notification opt-in modal
- [ ] Create email notification system
- [ ] Add semantic search for duplicate detection
- [ ] Implement real-time updates (optional)
- [ ] Add analytics tracking
- [ ] Create admin dashboard

## 🐛 Known Issues

- [ ] randomSeed field needs to be added to existing statements
- [ ] No duplicate detection yet (relies on manual moderation)
- [ ] AI feedback limited to 1 request per minute (rate limiting needed)

## 📚 Documentation

- [Technical Plan](../../claude/partial-app-discussion-technical-plan.md)
- [Design Document](../../docs/design-document.md)
- [Freedi Architecture](../../docs/FREEDI_ARCHITECTURE.md)

## 🤝 Contributing

Follow the main Freedi app guidelines:
- No `any` types
- Import types from `delib-npm`
- Use Firebase utilities
- Write tests for new features
- Follow atomic design patterns

## 📄 License

Same as main Freedi app - see LICENSE.md

## 🙏 Acknowledgments

Inspired by:
- StatementMain.tsx architecture
- MassConsensus feature
- RandomSuggestions component
