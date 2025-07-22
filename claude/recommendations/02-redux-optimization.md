# Redux State Management Optimization

This document outlines the comprehensive Redux refactoring needed to improve performance, maintainability, and developer experience.

## Current Issues

1. **Complex Nested State**: Single slice managing multiple concerns
2. **Performance Anti-patterns**: Multiple forEach loops, unmemoized selectors
3. **Inconsistent Patterns**: Mixed naming conventions, different error handling
4. **Missing RTK Features**: Not using Entity Adapters or RTK Query

## Recommended Redux Architecture

### 1. Split Large Slices

**Current Structure** (Anti-pattern):
```typescript
// Single slice managing too many concerns
interface StatementsState {
  statements: Statement[];
  statementSubscription: StatementSubscription[];
  statementMembership: StatementMembership[];
  screen: ScreenStatement;
  statementsOrderBy: string;
  statementsSortBy: string;
  statementsFilterBy: StatementsFilterBy;
}
```

**Recommended Structure**:
```typescript
// Separate slices by domain
// statementsDataSlice.ts
interface StatementsDataState {
  entities: EntityState<Statement>;
  loading: 'idle' | 'pending' | 'succeeded' | 'failed';
  error: string | null;
}

// subscriptionsSlice.ts
interface SubscriptionsState {
  entities: EntityState<StatementSubscription>;
  userSubscriptions: Record<string, string[]>; // userId -> statementIds
}

// membershipSlice.ts
interface MembershipState {
  entities: EntityState<StatementMembership>;
  statementMembers: Record<string, string[]>; // statementId -> userIds
}

// statementsUISlice.ts
interface StatementsUIState {
  screen: ScreenStatement;
  ordering: {
    orderBy: string;
    sortBy: string;
    filterBy: StatementsFilterBy;
  };
  selectedStatementId: string | null;
}
```

### 2. Implement Entity Adapters

**Before**:
```typescript
// Manual array management
setStatement: (state, action) => {
  state.statements = updateArray(
    state.statements,
    action.payload,
    'statementId'
  );
}
```

**After**:
```typescript
import { createEntityAdapter } from '@reduxjs/toolkit';

const statementsAdapter = createEntityAdapter<Statement>({
  selectId: (statement) => statement.statementId,
  sortComparer: (a, b) => b.createdAt - a.createdAt,
});

const statementsSlice = createSlice({
  name: 'statements',
  initialState: statementsAdapter.getInitialState({
    loading: 'idle',
    error: null,
  }),
  reducers: {
    setStatement: statementsAdapter.upsertOne,
    setStatements: statementsAdapter.upsertMany,
    removeStatement: statementsAdapter.removeOne,
    updateStatement: statementsAdapter.updateOne,
  },
});

// Auto-generated selectors
export const {
  selectAll: selectAllStatements,
  selectById: selectStatementById,
  selectIds: selectStatementIds,
} = statementsAdapter.getSelectors(
  (state: RootState) => state.statements
);
```

### 3. Optimize Selectors with Proper Memoization

**Current Anti-pattern**:
```typescript
// Creates new array on every render
const notifications = useSelector(inAppNotificationsSelector)
  .filter(n => n.creatorId !== creator?.uid);
```

**Optimized Solution**:
```typescript
// Memoized selector
export const selectFilteredNotifications = createSelector(
  [inAppNotificationsSelector, creatorSelector],
  (notifications, creator) => {
    if (!creator?.uid) return notifications;
    return notifications.filter(n => n.creatorId !== creator.uid);
  }
);

// Parameterized selector factory
export const makeSelectStatementsByParent = () =>
  createSelector(
    [selectAllStatements, (state, parentId: string) => parentId],
    (statements, parentId) =>
      statements.filter(s => s.parentId === parentId)
  );

// In component
const selectStatementsByParent = useMemo(makeSelectStatementsByParent, []);
const childStatements = useSelector(state => 
  selectStatementsByParent(state, parentId)
);
```

### 4. Implement RTK Query for Firebase

**Current Pattern**:
```typescript
// Manual Firebase listeners
useEffect(() => {
  const unsubscribe = onSnapshot(
    collection(db, 'statements'),
    (snapshot) => {
      const statements = snapshot.docs.map(doc => doc.data());
      dispatch(setStatements(statements));
    }
  );
  return unsubscribe;
}, []);
```

**RTK Query Solution**:
```typescript
// firebaseApi.ts
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';

export const firebaseApi = createApi({
  reducerPath: 'firebaseApi',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['Statement', 'User', 'Vote'],
  endpoints: (builder) => ({
    getStatements: builder.query<Statement[], string>({
      queryFn: async (parentId) => {
        try {
          const q = query(
            collection(db, 'statements'),
            where('parentId', '==', parentId),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          const snapshot = await getDocs(q);
          const statements = snapshot.docs.map(doc => ({
            ...doc.data(),
            statementId: doc.id,
          })) as Statement[];
          return { data: statements };
        } catch (error) {
          return { error: { status: 'FETCH_ERROR', error } };
        }
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ statementId }) => ({ 
                type: 'Statement' as const, 
                id: statementId 
              })),
              { type: 'Statement', id: 'LIST' },
            ]
          : [{ type: 'Statement', id: 'LIST' }],
    }),
    
    // Real-time subscription
    subscribeToStatements: builder.query<Statement[], string>({
      queryFn: () => ({ data: [] }),
      async onCacheEntryAdded(
        parentId,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        await cacheDataLoaded;
        
        const unsubscribe = onSnapshot(
          query(
            collection(db, 'statements'),
            where('parentId', '==', parentId)
          ),
          (snapshot) => {
            const statements = snapshot.docs.map(doc => ({
              ...doc.data(),
              statementId: doc.id,
            })) as Statement[];
            updateCachedData(() => statements);
          }
        );
        
        await cacheEntryRemoved;
        unsubscribe();
      },
    }),
  }),
});

// Auto-generated hooks
export const { 
  useGetStatementsQuery, 
  useSubscribeToStatementsQuery 
} = firebaseApi;
```

### 5. Fix Performance Anti-patterns

**Current Issue**:
```typescript
// Multiple state updates in loop
statements.forEach((statement) => {
  state.statements = updateArray(
    state.statements,
    statement,
    'statementId'
  );
});
```

**Optimized Solution**:
```typescript
// Batch update
setStatements: (state, action: PayloadAction<Statement[]>) => {
  // With Entity Adapter
  statementsAdapter.upsertMany(state, action.payload);
  
  // Or with Immer (if not using Entity Adapter)
  const statementsMap = new Map(
    state.statements.map(s => [s.statementId, s])
  );
  action.payload.forEach(statement => {
    statementsMap.set(statement.statementId, statement);
  });
  state.statements = Array.from(statementsMap.values());
}
```

### 6. Normalize State Structure

**Current Denormalized State**:
```typescript
interface Statement {
  statementId: string;
  parentId: string;
  subStatements: Statement[]; // Nested data
  evaluations: Evaluation[]; // Embedded data
  // ... more fields
}
```

**Normalized State**:
```typescript
// Separate normalized slices
interface NormalizedState {
  statements: {
    byId: Record<string, Statement>;
    allIds: string[];
  };
  evaluations: {
    byId: Record<string, Evaluation>;
    byStatement: Record<string, string[]>; // statementId -> evaluationIds
  };
  relationships: {
    parentToChildren: Record<string, string[]>;
    childToParent: Record<string, string>;
  };
}

// Selectors to reconstruct data
export const selectStatementWithChildren = createSelector(
  [selectStatementById, selectAllStatements],
  (statement, allStatements) => {
    if (!statement) return null;
    return {
      ...statement,
      children: allStatements.filter(s => s.parentId === statement.statementId),
    };
  }
);
```

### 7. Add Loading and Error States

```typescript
interface AsyncState {
  loading: 'idle' | 'pending' | 'succeeded' | 'failed';
  error: string | null;
  lastFetch: number | null;
}

const statementsSlice = createSlice({
  name: 'statements',
  initialState: {
    ...statementsAdapter.getInitialState(),
    loading: 'idle' as const,
    error: null as string | null,
    lastFetch: null as number | null,
  },
  reducers: {
    fetchStatementsStart: (state) => {
      state.loading = 'pending';
      state.error = null;
    },
    fetchStatementsSuccess: (state, action) => {
      state.loading = 'succeeded';
      state.lastFetch = Date.now();
      statementsAdapter.upsertMany(state, action.payload);
    },
    fetchStatementsFailure: (state, action) => {
      state.loading = 'failed';
      state.error = action.payload;
    },
  },
});
```

## Migration Strategy

### Phase 1: Preparation (Week 1)
1. Create new slice structure alongside existing
2. Add Entity Adapters to new slices
3. Write migration utilities

### Phase 2: Gradual Migration (Week 2-3)
1. Migrate one feature at a time
2. Run old and new slices in parallel
3. Update components incrementally

### Phase 3: Cleanup (Week 4)
1. Remove old slices
2. Update all selectors
3. Performance testing

## Performance Improvements Expected

- **50% reduction** in unnecessary re-renders
- **70% faster** selector performance with memoization
- **30% reduction** in memory usage with normalized state
- **Better DevTools** experience with cleaner action logs

## Code Examples

### Before and After Component Usage

**Before**:
```typescript
const StatementList = ({ parentId }) => {
  const statements = useSelector(state => 
    state.statements.statements.filter(s => s.parentId === parentId)
  );
  // Re-renders on any statement change
};
```

**After**:
```typescript
const StatementList = ({ parentId }) => {
  const { data: statements, isLoading } = useGetStatementsQuery(parentId);
  // Only re-renders when relevant statements change
  
  if (isLoading) return <Loader />;
  return statements.map(s => <StatementCard key={s.id} {...s} />);
};
```

## Testing Strategy

1. **Unit Tests** for all new selectors
2. **Integration Tests** for RTK Query endpoints
3. **Performance Tests** comparing old vs new
4. **Migration Tests** ensuring data integrity

This refactoring will significantly improve the maintainability and performance of the Redux store while providing a better developer experience.