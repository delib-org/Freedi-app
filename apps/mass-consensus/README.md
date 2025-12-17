# WizCol Mass Consensus - understanding crowd solutions

A high-performance WizCol application for crowdsourced solution discussions, optimized for speed and user experience.

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
- Firebase project with Firestore (or use the included emulator for development)
- Google Gemini API key (optional - only for AI feedback feature)
- Existing Freedi app data model (uses delib-npm types)

## 🚀 Quick Start

**Get up and running in 3 steps:**

```bash
# 1. Install dependencies
cd apps/mass-consensus
npm install

# 2. Set up environment
cp .env.example .env

# 3. Start the app
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) - that's it!

The app is pre-configured to work with the Firebase emulator. Just make sure the emulator is running in the main project directory.

## 🛠️ Installation (Detailed)

### 1. Install Dependencies

```bash
cd apps/mass-consensus
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

The `.env.example` file comes with sensible defaults for development.

#### Option A: Development with Firebase Emulator (Recommended)

The `.env.example` is pre-configured for the emulator. No changes needed!

**Just ensure the Firebase emulator is running:**

```bash
# From the main project directory (Freedi-app/)
firebase emulators:start
```

**Configuration (already set in .env.example):**
- Firestore emulator: `localhost:8081`
- Project: `freedi-test`
- All public Firebase config included

#### Option B: Production / Custom Firebase Project

If you want to use a production Firebase project or your own test project:

1. Open `.env` in your editor
2. **Comment out** the emulator settings:
   ```env
   # USE_FIREBASE_EMULATOR=true
   # FIRESTORE_EMULATOR_HOST=localhost:8081
   # FIREBASE_PROJECT_ID=freedi-test
   ```

3. **Uncomment and configure** the production section:
   ```env
   FIREBASE_PROJECT_ID=your-production-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...your-key...\n-----END PRIVATE KEY-----\n"
   ```

4. **Get your Firebase Admin credentials:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project > ⚙️ Settings > Service Accounts
   - Click "Generate new private key"
   - Copy values from the downloaded JSON file to your `.env`

5. **Update public Firebase config** (if using a different project):
   - Replace the `NEXT_PUBLIC_FIREBASE_*` values with your project's config
   - Get from: Firebase Console > Project Settings > Your apps > Web app

6. **(Optional) Add Gemini API key** for AI feedback:
   ```env
   GEMINI_API_KEY=your-gemini-api-key-here
   ```
   - Get from: [Google AI Studio](https://makersuite.google.com/app/apikey)

**See `.env.example` for detailed comments and instructions.**

### 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

### 4. Database Setup (Optional)

If you're using an existing Firestore database, ensure statements have a `randomSeed` field for efficient random sampling:

```javascript
// Add to existing statements (run in Firebase Console or via script)
statements.where('statementType', '==', 'option').forEach(doc => {
  doc.ref.update({ randomSeed: Math.random() });
});
```

**Note:** New statements created through the app will automatically include this field.

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
