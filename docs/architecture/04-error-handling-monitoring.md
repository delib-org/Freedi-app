# Error Handling and Monitoring Strategy

This document outlines a comprehensive approach to error handling, logging, and monitoring for the Freedi app.

## Current Issues

1. **No Error Boundaries**: Only one error boundary for Statement page
2. **Console-based Logging**: No structured logging or error tracking
3. **Inconsistent Error Handling**: Mix of try/catch patterns
4. **No Monitoring**: No visibility into production errors
5. **Poor User Experience**: Technical error messages shown to users

## 1. Implement Comprehensive Error Boundaries

### 1.1 Root Error Boundary

```typescript
// src/components/ErrorBoundary/RootErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorBoundaryKey: number;
}

export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorBoundaryKey: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorBoundaryKey: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Send to Sentry
    Sentry.withScope((scope) => {
      scope.setExtras(errorInfo);
      Sentry.captureException(error);
    });
    
    // Update state with error info
    this.setState({
      errorInfo,
    });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorBoundaryKey: this.state.errorBoundaryKey + 1,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      
      if (Fallback) {
        return (
          <Fallback
            error={this.state.error!}
            resetError={this.resetError}
          />
        );
      }
      
      // Default fallback UI
      return <DefaultErrorFallback error={this.state.error!} resetError={this.resetError} />;
    }

    return (
      <React.Fragment key={this.state.errorBoundaryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

// Default error UI
const DefaultErrorFallback: React.FC<{ error: Error; resetError: () => void }> = ({
  error,
  resetError,
}) => {
  const isDev = import.meta.env.DEV;
  
  return (
    <div className="error-fallback">
      <h1>משהו השתבש / Something went wrong</h1>
      <p>אנחנו מצטערים, אירעה שגיאה בלתי צפויה.</p>
      <p>We're sorry, an unexpected error occurred.</p>
      
      {isDev && (
        <details style={{ whiteSpace: 'pre-wrap' }}>
          <summary>Error details (Development only)</summary>
          {error.toString()}
          <br />
          {error.stack}
        </details>
      )}
      
      <div className="error-actions">
        <button onClick={resetError}>נסה שוב / Try again</button>
        <button onClick={() => window.location.href = '/'}>
          חזור לדף הבית / Go to home
        </button>
      </div>
    </div>
  );
};
```

### 1.2 Feature-Specific Error Boundaries

```typescript
// src/components/ErrorBoundary/AsyncBoundary.tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface AsyncBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ComponentType<any>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export const AsyncBoundary: React.FC<AsyncBoundaryProps> = ({
  children,
  fallback = <LoaderGlass />,
  errorFallback = ErrorFallback,
  onError,
}) => {
  return (
    <ErrorBoundary
      FallbackComponent={errorFallback}
      onError={onError}
      onReset={() => window.location.reload()}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
};

// Usage in routes
<AsyncBoundary errorFallback={StatementErrorFallback}>
  <StatementMain />
</AsyncBoundary>
```

## 2. Structured Error Logging Service

### 2.1 Logger Implementation

```typescript
// src/services/logger/logger.ts
import * as Sentry from '@sentry/react';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  userId?: string;
  statementId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private logLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? JSON.stringify(context) : '';
    return `[${timestamp}] [${level}] ${message} ${contextStr}`;
  }

  private sendToMonitoring(
    level: LogLevel,
    message: string,
    error?: Error,
    context?: LogContext
  ) {
    if (level >= LogLevel.ERROR) {
      Sentry.captureException(error || new Error(message), {
        level: 'error',
        extra: context,
      });
    } else if (level === LogLevel.WARN) {
      Sentry.captureMessage(message, 'warning');
    }
  }

  debug(message: string, context?: LogContext) {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.info(this.formatMessage('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.logLevel <= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message, context));
    }
  }

  warn(message: string, context?: LogContext) {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, context));
      this.sendToMonitoring(LogLevel.WARN, message, undefined, context);
    }
  }

  error(message: string, error?: Error, context?: LogContext) {
    console.error(this.formatMessage('ERROR', message, context), error);
    this.sendToMonitoring(LogLevel.ERROR, message, error, context);
  }

  // Track specific events
  trackEvent(eventName: string, properties?: Record<string, any>) {
    this.info(`Event: ${eventName}`, { metadata: properties });
    
    // Send to analytics
    if (window.gtag) {
      window.gtag('event', eventName, properties);
    }
  }

  // Performance tracking
  trackPerformance(metricName: string, value: number, unit: string = 'ms') {
    this.info(`Performance: ${metricName}`, { 
      metadata: { value, unit } 
    });
    
    // Send to monitoring
    Sentry.addBreadcrumb({
      category: 'performance',
      message: metricName,
      level: 'info',
      data: { value, unit },
    });
  }
}

export const logger = new Logger();
```

### 2.2 Error Handler Utilities

```typescript
// src/services/errorHandler/errorHandler.ts
import { logger } from '../logger/logger';
import { FirebaseError } from 'firebase/app';

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = {
  handleFirebaseError(error: FirebaseError, context?: any): AppError {
    logger.error('Firebase error', error, context);
    
    const errorMap: Record<string, { message: string; code: string }> = {
      'auth/user-not-found': {
        message: 'משתמש לא נמצא / User not found',
        code: 'USER_NOT_FOUND',
      },
      'auth/wrong-password': {
        message: 'סיסמה שגויה / Wrong password',
        code: 'INVALID_PASSWORD',
      },
      'permission-denied': {
        message: 'אין לך הרשאה לבצע פעולה זו / Permission denied',
        code: 'PERMISSION_DENIED',
      },
      'not-found': {
        message: 'המידע המבוקש לא נמצא / Data not found',
        code: 'NOT_FOUND',
      },
    };
    
    const mapped = errorMap[error.code] || {
      message: 'שגיאה לא צפויה / Unexpected error',
      code: 'UNKNOWN_ERROR',
    };
    
    return new AppError(mapped.message, mapped.code, 500);
  },

  handleApiError(error: any, endpoint: string): AppError {
    logger.error(`API error at ${endpoint}`, error);
    
    if (error.response) {
      return new AppError(
        error.response.data.message || 'API error',
        error.response.data.code || 'API_ERROR',
        error.response.status
      );
    }
    
    if (error.request) {
      return new AppError(
        'לא ניתן להתחבר לשרת / Cannot connect to server',
        'NETWORK_ERROR',
        0
      );
    }
    
    return new AppError(
        'שגיאה בבקשה / Request error',
        'REQUEST_ERROR',
        400
    );
  },

  isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  },
};
```

## 3. Sentry Integration

### 3.1 Setup

```bash
npm install @sentry/react @sentry/tracing
```

```typescript
// src/services/monitoring/sentry.ts
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';
import { CaptureConsole } from '@sentry/integrations';

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.VITE_ENVIRONMENT || 'production',
      integrations: [
        new BrowserTracing({
          routingInstrumentation: Sentry.reactRouterV6Instrumentation(
            React.useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes
          ),
          tracingOrigins: ['localhost', 'freedi.app', /^\//],
        }),
        new CaptureConsole({
          levels: ['error', 'warn'],
        }),
      ],
      tracesSampleRate: 0.1, // 10% of transactions
      release: import.meta.env.VITE_APP_VERSION,
      beforeSend(event, hint) {
        // Filter out non-critical errors
        if (event.exception) {
          const error = hint.originalException;
          // Don't send cancelled requests
          if (error?.message?.includes('cancelled')) {
            return null;
          }
        }
        return event;
      },
    });
  }
}

// Enhanced error info
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('additional', context);
    }
    
    // Add user context
    const user = store.getState().creator;
    if (user) {
      scope.setUser({
        id: user.uid,
        email: user.email,
      });
    }
    
    // Add breadcrumbs
    scope.addBreadcrumb({
      message: 'Error occurred',
      level: 'error',
      data: context,
    });
    
    Sentry.captureException(error);
  });
}
```

### 3.2 React Integration

```typescript
// src/main.tsx
import { initSentry } from './services/monitoring/sentry';
import * as Sentry from '@sentry/react';

// Initialize Sentry before React
initSentry();

const SentryRoutes = Sentry.withSentryRouting(Routes);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={ErrorFallback} showDialog>
      <Provider store={store}>
        <BrowserRouter>
          <SentryRoutes />
        </BrowserRouter>
      </Provider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
```

## 4. Consistent Error Handling Patterns

### 4.1 Async Operations

```typescript
// src/hooks/useAsyncOperation.ts
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
}

export function useAsyncOperation<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (
    operation: () => Promise<T>,
    options?: {
      onSuccess?: (data: T) => void;
      onError?: (error: AppError) => void;
      errorContext?: Record<string, any>;
    }
  ) => {
    setState({ data: null, loading: true, error: null });
    
    try {
      const data = await operation();
      setState({ data, loading: false, error: null });
      options?.onSuccess?.(data);
      return data;
    } catch (error) {
      const appError = error instanceof AppError 
        ? error 
        : new AppError('Operation failed', 'OPERATION_FAILED');
      
      logger.error('Async operation failed', appError, options?.errorContext);
      setState({ data: null, loading: false, error: appError });
      options?.onError?.(appError);
      throw appError;
    }
  }, []);

  return { ...state, execute };
}

// Usage
const StatementActions = () => {
  const { execute, loading, error } = useAsyncOperation<void>();
  const toast = useToast();

  const handleDelete = async (statementId: string) => {
    await execute(
      () => deleteStatement(statementId),
      {
        onSuccess: () => {
          toast.success('Statement deleted successfully');
        },
        onError: (error) => {
          toast.error(error.message);
        },
        errorContext: { statementId, action: 'delete' },
      }
    );
  };
};
```

### 4.2 Firebase Operations

```typescript
// src/controllers/db/base/firebaseOperations.ts
export async function safeFirebaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  try {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;
    
    logger.trackPerformance(`firebase.${operationName}`, duration);
    
    return result;
  } catch (error) {
    if (error instanceof FirebaseError) {
      throw errorHandler.handleFirebaseError(error, {
        operation: operationName,
        ...context,
      });
    }
    
    logger.error(`Firebase operation failed: ${operationName}`, error as Error, context);
    throw new AppError(
      'Database operation failed',
      'DB_OPERATION_FAILED',
      500
    );
  }
}

// Usage
export async function getStatement(statementId: string): Promise<Statement | null> {
  return safeFirebaseOperation(
    async () => {
      const docRef = doc(db, Collections.statements, statementId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }
      
      return parse(StatementSchema, docSnap.data());
    },
    'getStatement',
    { statementId }
  );
}
```

## 5. User-Friendly Error Messages

### 5.1 Toast Notifications

```typescript
// src/services/toast/toastService.ts
import { toast, ToastOptions } from 'react-toastify';
import { logger } from '../logger/logger';

const defaultOptions: ToastOptions = {
  position: 'bottom-center',
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export const toastService = {
  success(message: string, options?: ToastOptions) {
    logger.info('Toast success', { message });
    toast.success(message, { ...defaultOptions, ...options });
  },

  error(error: AppError | Error | string, options?: ToastOptions) {
    const message = typeof error === 'string' 
      ? error 
      : error instanceof AppError 
        ? error.message 
        : 'An error occurred';
    
    logger.error('Toast error', error instanceof Error ? error : new Error(message));
    
    toast.error(message, {
      ...defaultOptions,
      autoClose: false,
      ...options,
    });
  },

  warn(message: string, options?: ToastOptions) {
    logger.warn('Toast warning', { message });
    toast.warn(message, { ...defaultOptions, ...options });
  },

  info(message: string, options?: ToastOptions) {
    logger.info('Toast info', { message });
    toast.info(message, { ...defaultOptions, ...options });
  },

  promise<T>(
    promise: Promise<T>,
    messages: {
      pending: string;
      success: string;
      error: string;
    },
    options?: ToastOptions
  ): Promise<T> {
    return toast.promise(promise, messages, {
      ...defaultOptions,
      ...options,
    });
  },
};
```

### 5.2 Localized Error Messages

```typescript
// src/services/i18n/errorMessages.ts
export const errorMessages = {
  en: {
    NETWORK_ERROR: 'Unable to connect to server. Please check your connection.',
    PERMISSION_DENIED: 'You don\'t have permission to perform this action.',
    NOT_FOUND: 'The requested item was not found.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
  },
  he: {
    NETWORK_ERROR: 'לא ניתן להתחבר לשרת. אנא בדוק את החיבור שלך.',
    PERMISSION_DENIED: 'אין לך הרשאה לבצע פעולה זו.',
    NOT_FOUND: 'הפריט המבוקש לא נמצא.',
    VALIDATION_ERROR: 'אנא בדוק את הקלט שלך ונסה שוב.',
    UNKNOWN_ERROR: 'אירעה שגיאה בלתי צפויה. אנא נסה שוב.',
  },
};

export function getErrorMessage(code: string, language: 'en' | 'he' = 'en'): string {
  return errorMessages[language][code] || errorMessages[language].UNKNOWN_ERROR;
}
```

## 6. Monitoring Dashboard

### 6.1 Custom Metrics

```typescript
// src/services/monitoring/metrics.ts
export const metrics = {
  // Performance metrics
  trackPageLoad(pageName: string, duration: number) {
    logger.trackPerformance(`page_load_${pageName}`, duration);
  },

  trackApiCall(endpoint: string, duration: number, status: 'success' | 'error') {
    logger.trackPerformance(`api_${endpoint}_${status}`, duration);
  },

  // User actions
  trackUserAction(action: string, properties?: Record<string, any>) {
    logger.trackEvent(`user_${action}`, properties);
  },

  // Business metrics
  trackBusinessEvent(event: string, value?: number, properties?: Record<string, any>) {
    logger.trackEvent(`business_${event}`, { value, ...properties });
  },
};

// Usage
const StatementVoting = () => {
  const handleVote = async (vote: number) => {
    const startTime = performance.now();
    
    try {
      await voteOnStatement(statementId, vote);
      metrics.trackApiCall('vote', performance.now() - startTime, 'success');
      metrics.trackUserAction('vote_submitted', { statementId, vote });
    } catch (error) {
      metrics.trackApiCall('vote', performance.now() - startTime, 'error');
      throw error;
    }
  };
};
```

## Implementation Checklist

1. **Week 1**: 
   - [ ] Install and configure Sentry
   - [ ] Implement root error boundary
   - [ ] Create logger service

2. **Week 2**:
   - [ ] Add feature-specific error boundaries
   - [ ] Implement consistent error handling patterns
   - [ ] Update all try/catch blocks

3. **Week 3**:
   - [ ] Add performance monitoring
   - [ ] Implement user-friendly error messages
   - [ ] Create error documentation

4. **Week 4**:
   - [ ] Set up monitoring dashboards
   - [ ] Train team on error handling
   - [ ] Monitor and refine error tracking

This comprehensive error handling and monitoring strategy will significantly improve debugging capabilities, user experience, and system reliability.