# Performance Optimization Guide

This document outlines comprehensive performance improvements for the Freedi app, focusing on reducing bundle size, optimizing React rendering, and improving Firebase queries.

## Current Performance Issues

1. **Bundle Size**: Main statement chunk is 1.4MB (386KB gzipped)
2. **React Re-renders**: Components re-rendering unnecessarily
3. **Missing Memoization**: Expensive computations on every render
4. **Firebase Queries**: No pagination or query optimization
5. **Image Loading**: No lazy loading or optimization

## 1. Bundle Size Optimization

### Current Bundle Analysis
```
dist/assets/statement-*.js    1,439.87 kB │ gzip: 386.07 kB
dist/assets/index-*.js          485.50 kB │ gzip: 152.37 kB
dist/assets/massConsensus-*.js  414.73 kB │ gzip: 129.49 kB
```

### Code Splitting Strategy

#### 1.1 Route-based Code Splitting
```typescript
// src/routes/router.tsx
import { lazy } from 'react';

// Lazy load all routes
const StatementMain = lazy(() => import('../view/pages/statement/StatementMain'));
const MassConsensus = lazy(() => import('../view/pages/massConsensus/MassConsensus'));
const Home = lazy(() => import('../view/pages/home/Home'));
const Settings = lazy(() => import('../view/pages/settings/Settings'));

export const routes = [
  {
    path: '/',
    element: <Suspense fallback={<LoaderGlass />}><Home /></Suspense>
  },
  {
    path: '/statement/:statementId/*',
    element: <Suspense fallback={<LoaderGlass />}><StatementMain /></Suspense>
  },
  // ... more routes
];
```

#### 1.2 Component-level Code Splitting
```typescript
// Split heavy components
const ReactFlowMap = lazy(() => 
  import('./components/ReactFlowMap')
    .then(module => ({ default: module.ReactFlowMap }))
);

const StatementEvaluations = lazy(() => 
  import('./components/StatementEvaluations')
);

const RichTextEditor = lazy(() => 
  import('./components/RichTextEditor')
);

// Usage
<Suspense fallback={<Skeleton height={400} />}>
  <ReactFlowMap statements={statements} />
</Suspense>
```

#### 1.3 Optimize Vite Configuration
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('@reduxjs') || id.includes('react-redux')) {
              return 'redux-vendor';
            }
            if (id.includes('reactflow')) {
              return 'reactflow-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
          }
          
          // Feature chunks
          if (id.includes('src/view/pages/statement')) {
            return 'statement-feature';
          }
          if (id.includes('src/view/pages/massConsensus')) {
            return 'mass-consensus-feature';
          }
        },
        // Optimize chunk size
        maxParallelFileOps: 10,
        experimentalMinChunkSize: 20000, // 20KB minimum
      },
    },
    // Optimize assets
    assetsInlineLimit: 4096, // 4KB
    chunkSizeWarningLimit: 500, // Warn at 500KB
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/auth'],
    exclude: ['@firebase/analytics'], // Exclude if not used
  },
});
```

## 2. React Performance Optimization

### 2.1 Component Memoization

```typescript
// Before: Component re-renders on every parent render
export const StatementCard = ({ statement, user, onVote }) => {
  // Complex component logic
};

// After: Only re-renders when props change
export const StatementCard = React.memo(({ 
  statement, 
  user, 
  onVote 
}) => {
  // Complex component logic
}, (prevProps, nextProps) => {
  // Custom comparison for deep equality if needed
  return (
    prevProps.statement.statementId === nextProps.statement.statementId &&
    prevProps.statement.lastUpdate === nextProps.statement.lastUpdate &&
    prevProps.user?.uid === nextProps.user?.uid
  );
});
```

### 2.2 Hook Optimization

```typescript
// Before: Functions recreated on every render
const StatementList = () => {
  const handleVote = (statementId, vote) => {
    dispatch(setVote({ statementId, vote }));
  };
  
  const sortedStatements = statements.sort((a, b) => 
    b.createdAt - a.createdAt
  );
};

// After: Memoized functions and values
const StatementList = () => {
  const handleVote = useCallback((statementId, vote) => {
    dispatch(setVote({ statementId, vote }));
  }, [dispatch]);
  
  const sortedStatements = useMemo(() => 
    [...statements].sort((a, b) => b.createdAt - a.createdAt),
    [statements]
  );
};
```

### 2.3 Context Optimization

```typescript
// Split contexts to minimize re-renders
// Before: Single large context
const AppContext = createContext({
  user: null,
  statements: [],
  votes: [],
  settings: {},
});

// After: Multiple focused contexts
const UserContext = createContext(null);
const StatementsContext = createContext([]);
const VotesContext = createContext([]);
const SettingsContext = createContext({});

// Use memo for context values
const StatementProvider = ({ children }) => {
  const statements = useSelector(selectAllStatements);
  
  const contextValue = useMemo(() => ({
    statements,
    // other values
  }), [statements]);
  
  return (
    <StatementsContext.Provider value={contextValue}>
      {children}
    </StatementsContext.Provider>
  );
};
```

## 3. Firebase Query Optimization

### 3.1 Implement Pagination

```typescript
// Before: Fetch all statements
const q = query(
  collection(db, 'statements'),
  where('parentId', '==', parentId),
  orderBy('createdAt', 'desc')
);

// After: Paginated queries
const ITEMS_PER_PAGE = 20;

export const usePaginatedStatements = (parentId: string) => {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      let q = query(
        collection(db, 'statements'),
        where('parentId', '==', parentId),
        orderBy('createdAt', 'desc'),
        limit(ITEMS_PER_PAGE)
      );
      
      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }
      
      const snapshot = await getDocs(q);
      const newStatements = snapshot.docs.map(doc => ({
        ...doc.data(),
        statementId: doc.id
      })) as Statement[];
      
      setStatements(prev => [...prev, ...newStatements]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
    } finally {
      setLoading(false);
    }
  }, [parentId, lastDoc, loading, hasMore]);
  
  return { statements, loadMore, loading, hasMore };
};
```

### 3.2 Optimize Real-time Listeners

```typescript
// Before: Listen to all documents
onSnapshot(collection(db, 'statements'), (snapshot) => {
  // Process all documents
});

// After: Limit real-time updates
const q = query(
  collection(db, 'statements'),
  where('parentId', '==', parentId),
  where('lastUpdate', '>', getTimestamp24HoursAgo()),
  orderBy('lastUpdate', 'desc'),
  limit(50)
);

// Use composite indexes for complex queries
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "statements",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "parentId", "order": "ASCENDING" },
        { "fieldPath": "lastUpdate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

## 4. Image Optimization

### 4.1 Lazy Loading Implementation

```typescript
// Custom hook for lazy loading
const useLazyLoad = () => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return { ref, isIntersecting };
};

// Lazy image component
const LazyImage: FC<{ src: string; alt: string; className?: string }> = ({ 
  src, 
  alt, 
  className 
}) => {
  const { ref, isIntersecting } = useLazyLoad();
  const [isLoaded, setIsLoaded] = useState(false);
  
  return (
    <div ref={ref} className={className}>
      {isIntersecting && (
        <>
          {!isLoaded && <Skeleton />}
          <img
            src={src}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
            loading="lazy"
            style={{ display: isLoaded ? 'block' : 'none' }}
          />
        </>
      )}
    </div>
  );
};
```

### 4.2 Image Format Optimization

```typescript
// Use WebP with fallback
const OptimizedImage: FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const webpSrc = src.replace(/\.(jpg|jpeg|png)$/, '.webp');
  
  return (
    <picture>
      <source srcSet={webpSrc} type="image/webp" />
      <source srcSet={src} type="image/jpeg" />
      <img src={src} alt={alt} loading="lazy" />
    </picture>
  );
};

// Responsive images
const ResponsiveImage: FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const srcSet = `
    ${src}?w=320 320w,
    ${src}?w=640 640w,
    ${src}?w=1280 1280w
  `;
  
  return (
    <img
      src={`${src}?w=640`}
      srcSet={srcSet}
      sizes="(max-width: 320px) 320px, (max-width: 640px) 640px, 1280px"
      alt={alt}
      loading="lazy"
    />
  );
};
```

## 5. Virtual Scrolling for Long Lists

```typescript
// Install: npm install @tanstack/react-virtual

import { useVirtualizer } from '@tanstack/react-virtual';

const VirtualStatementList: FC<{ statements: Statement[] }> = ({ statements }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: statements.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated item height
    overscan: 5, // Number of items to render outside viewport
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <StatementCard statement={statements[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

## 6. Web Workers for Heavy Computations

```typescript
// worker.ts
self.addEventListener('message', (e) => {
  const { type, data } = e.data;
  
  switch (type) {
    case 'CALCULATE_CONSENSUS':
      const result = calculateConsensus(data);
      self.postMessage({ type: 'CONSENSUS_RESULT', data: result });
      break;
    case 'PROCESS_STATEMENTS':
      const processed = processStatements(data);
      self.postMessage({ type: 'STATEMENTS_PROCESSED', data: processed });
      break;
  }
});

// Using the worker
const useWebWorker = () => {
  const workerRef = useRef<Worker>();
  
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./worker.ts', import.meta.url)
    );
    
    return () => workerRef.current?.terminate();
  }, []);
  
  const calculate = useCallback((data: any) => {
    return new Promise((resolve) => {
      workerRef.current?.postMessage({ type: 'CALCULATE_CONSENSUS', data });
      workerRef.current?.addEventListener('message', (e) => {
        if (e.data.type === 'CONSENSUS_RESULT') {
          resolve(e.data.data);
        }
      });
    });
  }, []);
  
  return { calculate };
};
```

## Performance Metrics to Track

1. **Core Web Vitals**
   - LCP (Largest Contentful Paint): Target < 2.5s
   - FID (First Input Delay): Target < 100ms
   - CLS (Cumulative Layout Shift): Target < 0.1

2. **Custom Metrics**
   - Time to Interactive (TTI)
   - Bundle size per route
   - React component render time
   - Firebase query response time

3. **Monitoring Setup**
```typescript
// Performance monitoring
import { getCLS, getFID, getLCP } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getLCP(console.log);

// Custom performance marks
performance.mark('app-init-start');
// ... initialization code
performance.mark('app-init-end');
performance.measure('app-initialization', 'app-init-start', 'app-init-end');
```

## Expected Improvements

- **Initial Load**: 50-70% reduction in time to interactive
- **Bundle Size**: 60% reduction in main chunk size
- **Runtime Performance**: 40% fewer re-renders
- **Memory Usage**: 30% reduction with virtual scrolling
- **Firebase Costs**: 50% reduction with proper pagination

These optimizations should significantly improve the user experience, especially on slower devices and networks.