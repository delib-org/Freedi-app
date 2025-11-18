# Setup Guide: Freedi Mass Consensus Module

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
cd apps/mass-consensus
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Firebase credentials:

```env
# Get these from Firebase Console → Project Settings → Service Accounts
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Get from Google AI Studio: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=AIza...

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_MAIN_APP_URL=http://localhost:5173
```

### 3. Prepare Firebase Data

Add `randomSeed` field to existing statements:

```javascript
// Run this script once in Firebase console or as a Cloud Function
const admin = require('firebase-admin');
const db = admin.firestore();

async function addRandomSeed() {
  const statements = await db.collection('statements')
    .where('statementType', '==', 'option')
    .get();

  const batch = db.batch();
  statements.forEach(doc => {
    batch.update(doc.ref, { randomSeed: Math.random() });
  });

  await batch.commit();
  console.log(`Updated ${statements.size} statements with randomSeed`);
}

addRandomSeed();
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:3001

### 5. Test with Existing Question

Navigate to: http://localhost:3001/q/[your-statement-id]

Replace `[your-statement-id]` with an actual question ID from your Firestore.

## Verification Checklist

- [ ] Can view question page with solutions
- [ ] Can evaluate solutions (check Firestore for new evaluation docs)
- [ ] Can load new batch of solutions
- [ ] Can submit new solution (check Firestore for new statement doc)
- [ ] Can view results page
- [ ] Can get AI feedback (if Gemini API key is set)

## Common Issues

### Issue: "Firebase Admin SDK initialization failed"

**Solution:** Check that:
- `FIREBASE_PRIVATE_KEY` includes `\n` characters (replace literal newlines)
- Service account has Firestore permissions
- Project ID matches your Firebase project

### Issue: "No solutions found"

**Solution:**
- Ensure you have statements with `statementType: 'option'` in Firestore
- Check that they have a `parentId` pointing to your question
- Verify `hide` field is not `true`

### Issue: "Random batch returns same solutions"

**Solution:**
- Add `randomSeed` field to all option statements
- Create composite index: `parentId + statementType + randomSeed`

### Issue: "AI feedback not working"

**Solution:**
- Verify Gemini API key is correct
- Check you have billing enabled on Google AI
- Ensure user has submitted at least one solution

## Firebase Indexes Required

Create these indexes in Firebase Console → Firestore → Indexes:

1. **statements** collection:
   ```
   Collection: statements
   Fields:
   - parentId (Ascending)
   - statementType (Ascending)
   - randomSeed (Ascending)
   ```

2. **statements** collection (for results):
   ```
   Collection: statements
   Fields:
   - parentId (Ascending)
   - statementType (Ascending)
   - consensus (Descending)
   ```

3. **evaluations** collection:
   ```
   Collection: evaluations
   Fields:
   - parentId (Ascending)
   - evaluatorId (Ascending)
   ```

## Performance Tuning

### 1. Enable Compression

In `next.config.js`:
```javascript
compress: true,
```

### 2. Optimize Images

Use Next.js Image component:
```tsx
import Image from 'next/image';
<Image src="..." width={400} height={300} />
```

### 3. Add Redis Cache (Optional)

For high-traffic deployments:

```bash
npm install ioredis
```

Update queries to use Redis cache:
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Cache question data
const cached = await redis.get(`question:${id}`);
if (cached) return JSON.parse(cached);

const question = await fetchFromFirebase(id);
await redis.set(`question:${id}`, JSON.stringify(question), 'EX', 60);
```

## Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/discuss
vercel
```

Set environment variables in Vercel dashboard.

### Option 2: Docker + Cloud Run

```bash
# Build
docker build -t freedi-discuss .

# Run locally
docker run -p 3001:3001 --env-file .env freedi-discuss

# Deploy to Cloud Run
gcloud run deploy freedi-discuss --source . --region us-central1
```

### Option 3: Node.js Server

```bash
npm run build
NODE_ENV=production npm start
```

## Monitoring Setup

### 1. Vercel Analytics

Already integrated. View at https://vercel.com/[project]/analytics

### 2. Firebase Performance

Add to client-side (optional):
```typescript
import { getPerformance } from 'firebase/performance';
const perf = getPerformance(app);
```

### 3. Custom Logging

Already set up. Logs go to:
- Development: Console
- Production: Vercel logs

## Next Steps

1. **Test thoroughly** with real users
2. **Monitor performance** metrics in Vercel dashboard
3. **Add rate limiting** to API routes (see TODO)
4. **Set up alerts** for errors and slow responses
5. **Integrate with main app** by adding links
6. **Collect feedback** and iterate

## Support

- Technical issues: Check TECHNICAL_PLAN.md
- Architecture questions: See README.md
- Main app integration: See ../README.md

## Success Criteria

Your setup is successful when:
- ✅ FCP < 1 second
- ✅ No console errors
- ✅ Evaluations saved to Firestore
- ✅ New solutions appear in database
- ✅ Results page shows sorted solutions
- ✅ AI feedback generates suggestions

---

**Need help?** Check the troubleshooting section or review the main documentation.
