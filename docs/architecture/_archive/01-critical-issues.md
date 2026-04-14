# Critical Issues - Immediate Action Required

These are the most critical issues that should be addressed immediately as they impact security, type safety, and performance.

## 1. Enable TypeScript Strict Mode

**Issue**: The main application's `tsconfig.json` lacks strict mode, contradicting the "no `any` allowed" guideline in CLAUDE.md.

**Impact**: Type safety issues, potential runtime errors, and harder debugging.

**Solution**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true
  }
}
```

**Action Steps**:
1. Update tsconfig.json with strict settings
2. Run `npm run typecheck` to identify type errors
3. Fix type errors incrementally
4. Remove the 4 existing `any` types found in:
   - `src/services/notificationService.ts`
   - `src/controllers/db/userData/setUserData.ts`
   - `src/controllers/db/massConsensus/setMassConsensus.ts`

## 2. Fix Security Vulnerabilities

### 2.1 Firestore Security Rules

**Issue**: Overly permissive write access for several collections.

**Vulnerable Collections**:
- `awaitingUsers`
- `online`
- `rooms`
- `participants`

**Solution**:
```javascript
// firestore.rules - Add proper authorization checks
match /rooms/{roomId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null 
    && request.auth.uid == resource.data.creatorId;
  allow update: if request.auth != null 
    && (request.auth.uid == resource.data.creatorId 
    || request.auth.uid in resource.data.adminIds);
  allow delete: if request.auth != null 
    && request.auth.uid == resource.data.creatorId;
}
```

### 2.2 Input Validation

**Issue**: No validation layer between user input and Firebase operations.

**Solution**: Implement validation using Valibot (already in dependencies):
```typescript
// Example validation schema
import { object, string, minLength, maxLength } from 'valibot';

const StatementInputSchema = object({
  statement: string([
    minLength(1, 'Statement cannot be empty'),
    maxLength(500, 'Statement too long')
  ]),
  description: string([maxLength(2000, 'Description too long')])
});

// Use before Firebase operations
const validatedInput = parse(StatementInputSchema, userInput);
```

### 2.3 Rate Limiting

**Issue**: No protection against API abuse.

**Solution**: Implement rate limiting in Firebase Functions:
```typescript
// functions/src/middleware/rateLimiter.ts
import * as functions from 'firebase-functions';
import { RateLimiter } from 'limiter';

const limiter = new RateLimiter({
  tokensPerInterval: 100,
  interval: 'minute',
  fireImmediately: true
});

export const withRateLimit = (handler: Function) => {
  return async (data: any, context: functions.https.CallableContext) => {
    const userId = context.auth?.uid || 'anonymous';
    
    if (!limiter.tryRemoveTokens(1)) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Too many requests. Please try again later.'
      );
    }
    
    return handler(data, context);
  };
};
```

## 3. Reduce Bundle Size (1.4MB Statement Chunk)

**Issue**: The statement chunk is 1.4MB (386KB gzipped), causing slow initial loads.

**Major Contributors**:
- ReactFlow library
- All statement-related components bundled together
- No code splitting

**Solution**:

### 3.1 Implement Dynamic Imports
```typescript
// src/view/pages/statement/StatementMain.tsx
import { lazy, Suspense } from 'react';

// Lazy load heavy components
const ReactFlowMap = lazy(() => import('./components/ReactFlowMap'));
const StatementEvaluations = lazy(() => import('./components/StatementEvaluations'));
const StatementVoting = lazy(() => import('./components/StatementVoting'));

// Use with Suspense
<Suspense fallback={<LoaderGlass />}>
  <ReactFlowMap />
</Suspense>
```

### 3.2 Update Vite Configuration
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'reactflow': ['reactflow'],
          'ui-components': ['lucide-react'],
        }
      }
    }
  }
});
```

### 3.3 Route-based Code Splitting
```typescript
// src/routes/router.tsx
const routes = [
  {
    path: '/statement/:statementId',
    component: lazy(() => import('../view/pages/statement/StatementMain')),
  },
  {
    path: '/mass-consensus',
    component: lazy(() => import('../view/pages/massConsensus/MassConsensus')),
  }
];
```

## Implementation Priority

1. **Today**: Enable TypeScript strict mode and fix resulting errors
2. **This Week**: Update Firestore security rules
3. **Next Week**: Implement input validation and bundle optimization
4. **Within 2 Weeks**: Add rate limiting to all Firebase Functions

## Metrics to Track

- **Bundle Size**: Target < 500KB for main chunk
- **Type Errors**: Should be 0 after strict mode fixes
- **Security Incidents**: Monitor for unauthorized access attempts
- **API Rate Limit Hits**: Track to adjust limits appropriately

## Testing After Implementation

1. Run full type check: `npm run typecheck`
2. Test all Firebase operations with validation
3. Verify bundle sizes: `npm run build -- --analyze`
4. Security audit with Firebase Rules Simulator
5. Load test API endpoints for rate limiting