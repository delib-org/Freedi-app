# Simplified Implementation Guide: Statement-Level Access Override

## Executive Summary

Simple rule: **If a statement has `membership.access` defined, it overrides the top parent's access. Otherwise, it inherits from the top parent.**

No complex parent chain traversal. Just two checks: current statement and top parent.

## How It Works

### Current System
All statements use `topParentId` to check permissions - everything inherits from the root group.

### New System
```typescript
const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;
```

That's it. Local overrides global.

## Architecture

```
Check statement.membership.access
    ↓
If exists:
    → Use statement's access level
If not:
    → Use topParent's access level
    ↓
If Access.public:
    → Auto-authenticate (Google or Anonymous)
    → Generate temporal name if anonymous
    → Grant Role.member access
```

## TODO List

### Phase 1: Core Changes ⏱️ 3-4 days

- [ ] **1.1 Update Authorization Hook**
  - File: `src/controllers/hooks/useAuthorization.ts`
  - Modify to check statement's membership.access first
  - Fall back to topParent's membership.access
  - Add auto-authentication for Access.public

- [ ] **1.2 Create Public Authentication Handler**
  - File: `src/controllers/auth/publicAuthHandler.ts` (NEW)
  - Auto-authenticate users accessing public statements
  - Handle Google silent sign-in and anonymous fallback
  - Generate temporal names for anonymous users

- [ ] **1.3 Create Temporal Name Generator**
  - File: `src/utils/temporalNameGenerator.ts` (NEW)
  - Generate names like "ThoughtfulExplorer123"
  - Ensure uniqueness within session

- [ ] **1.4 Update StatementMain Component**
  - File: `src/view/pages/statement/StatementMain.tsx`
  - Add effect to trigger auto-authentication for public statements
  - Handle direct link parameters (?direct=true)

### Phase 2: UI Components ⏱️ 2-3 days

- [ ] **2.1 Create Access Level Indicator**
  - File: `src/view/pages/statement/components/AccessLevelIndicator.tsx` (NEW)
  - Show current access level (inherited or overridden)
  - Visual indicator when statement overrides parent

- [ ] **2.2 Update Statement Settings**
  - File: `src/view/pages/statement/components/settings/StatementSettings.tsx`
  - Add membership.access selector
  - Show "Inheriting from parent" when not set
  - Allow admins to override or clear override

- [ ] **2.3 Create Share Statement Component**
  - File: `src/view/pages/statement/components/sharing/ShareStatement.tsx` (NEW)
  - Generate direct links for public statements
  - Show access level in sharing UI

### Phase 3: Backend Updates ⏱️ 2 days

- [ ] **3.1 Update Subscription Logic**
  - File: `functions/src/fn_subscriptions.ts`
  - Respect statement-level access overrides
  - Auto-subscribe for public statements

- [ ] **3.2 Create Public Access Handler Function**
  - File: `functions/src/fn_public_access.ts` (NEW)
  - Validate public access
  - Create subscriptions for public statement access

### Phase 4: Testing & Deployment ⏱️ 2-3 days

- [ ] **4.1 Test Access Override Logic**
  - [ ] Statement with override uses its own access
  - [ ] Statement without override uses topParent's access
  - [ ] Public statements allow anonymous access
  - [ ] Mixed access levels in same tree

- [ ] **4.2 Test Auto-Authentication**
  - [ ] Direct links to public statements work
  - [ ] Temporal names generated for anonymous users
  - [ ] Google users silently authenticate

- [ ] **4.3 Deploy**
  - [ ] Test on staging
  - [ ] Deploy to production
  - [ ] Monitor for issues

## Implementation Details

### 1. Updated Authorization Hook

```typescript
// src/controllers/hooks/useAuthorization.ts
export const useAuthorization = (statementId?: string): AuthorizationState => {
  const [authState, setAuthState] = useState<AuthorizationState>({
    isAuthorized: false,
    role: Role.unsubscribed,
    isAdmin: false,
    loading: true,
    error: false,
    errorMessage: '',
    isWaitingForApproval: false
  });

  const statement = useAppSelector(statementSelector(statementId));
  const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
  const creator = useSelector(creatorSelector);
  
  // SIMPLIFIED: Check statement override or topParent
  const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;
  
  // Get subscription based on which access we're using
  const subscriptionId = statement?.membership?.access 
    ? statementId  // Use statement subscription if it has its own access
    : statement?.topParentId; // Otherwise use topParent subscription
    
  const subscription = useAppSelector(statementSubscriptionSelector(subscriptionId));
  const role = subscription?.role;

  useEffect(() => {
    if (!statement || !creator) return;
    
    // Handle public access
    if (effectiveAccess === Access.public) {
      // Auto-authenticate if needed
      if (!creator.uid) {
        handlePublicAutoAuth().then(() => {
          // After auth, subscription will be created automatically
        });
      }
      
      setAuthState({
        isAuthorized: true,
        role: Role.member,
        isAdmin: false,
        loading: false,
        error: false,
        errorMessage: '',
        creator,
        isWaitingForApproval: false
      });
      return;
    }
    
    // Handle other access levels with simplified logic
    if (isMemberRole(statement, creator.uid, role)) {
      setAuthState({
        isAuthorized: true,
        loading: false,
        error: false,
        errorMessage: '',
        creator,
        isWaitingForApproval: false,
        role,
        isAdmin: isAdminRole(role),
      });
      return;
    }
    
    // Check for open access
    if (isOpenAccess(effectiveAccess, creator, role)) {
      // Auto-subscribe as member
      const statementToSubscribe = statement?.membership?.access 
        ? statement 
        : topParentStatement;
        
      setStatementSubscriptionToDB({
        statement: statementToSubscribe,
        creator,
        role: Role.member,
        getInAppNotification: true,
        getEmailNotification: false,
        getPushNotification: false
      });
      
      setAuthState({
        isAuthorized: true,
        loading: false,
        role: Role.member,
        isAdmin: false,
        error: false,
        errorMessage: '',
        creator,
        isWaitingForApproval: false
      });
      return;
    }
    
    // Handle moderated access
    if (effectiveAccess === Access.moderated && role !== Role.banned) {
      if (role === Role.waiting) {
        setAuthState({
          isAuthorized: false,
          loading: false,
          role,
          isAdmin: false,
          error: false,
          errorMessage: '',
          creator,
          isWaitingForApproval: true
        });
      } else {
        // Subscribe as waiting
        const statementToSubscribe = statement?.membership?.access 
          ? statement 
          : topParentStatement;
          
        setStatementSubscriptionToDB({
          statement: statementToSubscribe,
          creator,
          role: Role.waiting,
          getInAppNotification: false,
          getEmailNotification: false,
          getPushNotification: false,
        });
      }
      return;
    }
    
    // Not authorized
    setAuthState({
      isAuthorized: false,
      role: Role.banned,
      isAdmin: false,
      loading: false,
      error: true,
      errorMessage: 'You are not authorized to view this statement.',
      creator,
      isWaitingForApproval: false
    });
    
  }, [statement, creator, subscription, role, topParentStatement, effectiveAccess]);

  return authState;
};

// Updated helper function
function isOpenAccess(
  access: Access | undefined,
  creator: Creator,
  role?: Role
): boolean {
  if (role === Role.banned) return false;
  
  return (
    access === Access.public ||
    access === Access.openToAll ||
    (access === Access.openForRegistered && creator.isAnonymous === false)
  );
}
```

### 2. Public Authentication Handler

```typescript
// src/controllers/auth/publicAuthHandler.ts
import { signInAnonymously, signInWithPopup, GoogleAuthProvider, updateProfile } from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { generateTemporalName } from '@/utils/temporalNameGenerator';

export async function handlePublicAutoAuth(): Promise<void> {
  try {
    // Check if already authenticated
    if (auth.currentUser) {
      return;
    }
    
    // Try silent Google sign-in first
    const hasGoogleSession = localStorage.getItem('lastAuthProvider') === 'google';
    if (hasGoogleSession) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'none' });
        await signInWithPopup(auth, provider);
        localStorage.setItem('lastAuthProvider', 'google');
        return;
      } catch {
        // Silent sign-in failed, continue with anonymous
      }
    }
    
    // Sign in anonymously
    const result = await signInAnonymously(auth);
    const temporalName = generateTemporalName();
    
    // Update profile with temporal name
    await updateProfile(result.user, {
      displayName: temporalName
    });
    
    // Store for this session
    sessionStorage.setItem('temporalName', temporalName);
    sessionStorage.setItem('isAnonymousUser', 'true');
    
  } catch (error) {
    console.error('Public auto-auth failed:', error);
  }
}
```

### 3. Temporal Name Generator

```typescript
// src/utils/temporalNameGenerator.ts
const adjectives = [
  'Thoughtful', 'Curious', 'Insightful', 'Creative', 'Analytical',
  'Observant', 'Mindful', 'Reflective', 'Intuitive', 'Logical',
  'Wise', 'Bright', 'Clear', 'Deep', 'Fair',
  'Open', 'Sharp', 'Quick', 'Keen', 'Bold'
];

const nouns = [
  'Thinker', 'Explorer', 'Scholar', 'Observer', 'Analyst',
  'Contributor', 'Participant', 'Voice', 'Mind', 'Perspective',
  'Learner', 'Seeker', 'Questioner', 'Listener', 'Speaker'
];

const usedNames = new Set<string>();

export function generateTemporalName(): string {
  let attempts = 0;
  let name: string;
  
  do {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;
    name = `${adjective}${noun}${number}`;
    attempts++;
    
    // Fallback after too many attempts
    if (attempts > 50) {
      name = `User${Date.now()}`;
      break;
    }
  } while (usedNames.has(name));
  
  usedNames.add(name);
  return name;
}

// Clear used names on page refresh
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    usedNames.clear();
  });
}
```

### 4. Updated StatementMain Component

```typescript
// src/view/pages/statement/StatementMain.tsx (add to existing component)
const StatementMain: React.FC = () => {
  // ... existing code ...
  
  const statement = useAppSelector(statementSelector(statementId));
  const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
  const creator = useAppSelector(creatorSelector);
  
  // Auto-authenticate for public access
  useEffect(() => {
    const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;
    
    if (effectiveAccess === Access.public && !creator?.uid) {
      // Page loaded with public access and no auth
      handlePublicAutoAuth();
    }
  }, [statement?.membership?.access, topParentStatement?.membership?.access, creator?.uid]);
  
  // ... rest of component
}
```

## User Experience Flows

### Flow 1: Public Statement Override
```
Group (Access.openForRegistered) 
└── Public FAQ (Access.public) ← User clicks direct link
    → No login screen
    → Auto-authenticate (Google or Anonymous)
    → Instant access with Role.member
```

### Flow 2: Restricted Statement Override
```
Group (Access.openToAll)
└── Private Discussion (Access.moderated) ← User navigates here
    → Check for subscription to this specific statement
    → Show "Request Access" if not subscribed
    → Admin approves → Access granted
```

### Flow 3: Inherited Access (No Override)
```
Group (Access.openForRegistered)
└── Regular Discussion (no membership field) ← Uses parent's access
    → Must be registered user
    → Auto-subscribe on first visit
```

## Example Permission Structure

```
Main Group (Access.openForRegistered) - Registered users only
├── Welcome Section - Inherits (registered users)
├── Public FAQ (Access.public) - Anyone can access
│   ├── Question 1 - Inherits parent (public)
│   └── Question 2 (Access.moderated) - Requires approval
├── VIP Section (Access.secret) - Invite only
│   └── VIP Discussion - Inherits parent (secret)
└── Open Forum (Access.openToAll) - Anyone including anonymous
```

## Testing Checklist

- [ ] Statement with `membership.access` uses its own access level
- [ ] Statement without `membership.access` uses topParent's access
- [ ] Public statements allow anonymous access without login
- [ ] Direct links to public statements work (`?direct=true`)
- [ ] Temporal names generated for anonymous users
- [ ] Mixed access levels work in the same tree
- [ ] Existing statements without membership field still work
- [ ] Access indicator shows correct inheritance

## Benefits of This Approach

1. **Simplicity**: Only two checks - current or top parent
2. **Performance**: No recursive parent traversal
3. **Clarity**: Easy to understand where permissions come from
4. **Flexibility**: Any statement can override its parent's access
5. **Backward Compatible**: Existing statements continue to work

## Questions Resolved

1. **Q**: Should we check all parents up the chain?
   **A**: No, just current statement and top parent.

2. **Q**: What if a statement has no membership field?
   **A**: It inherits from top parent (current behavior).

3. **Q**: Can a public group have a secret sub-statement?
   **A**: Yes, any statement can override its parent's access.

## Next Steps

1. Implement Phase 1 (Core Changes)
2. Test with a few statements
3. Add UI components
4. Deploy to staging
5. Beta test with selected groups
6. Full rollout

## Monitoring

Track these metrics:
- Number of statements with access overrides
- Public statement usage
- Anonymous user sessions
- Time to first content view
- Conversion rate (anonymous → registered)