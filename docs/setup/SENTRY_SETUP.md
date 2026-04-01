# Sentry Setup Guide

## Overview

Sentry has been integrated into the Freedi app for production error monitoring. This will help track and debug errors that occur in production.

## Configuration

### 1. Create a Sentry Account

1. Go to [https://sentry.io](https://sentry.io) and create an account
2. Create a new project for your React application
3. Get your DSN from: Settings → Projects → [Your Project] → Client Keys (DSN)

### 2. Set Environment Variables

Add the following to your `.env` file:

```env
# Required - Your Sentry DSN
VITE_SENTRY_DSN=https://YOUR_DSN_HERE@sentry.io/PROJECT_ID

# Optional - defaults to 'production'
VITE_ENVIRONMENT=production

# Optional - defaults to current version in main.tsx
VITE_APP_VERSION=1.0.11
```

### 3. Features Configured

- **Error Tracking**: Automatically captures all unhandled errors
- **Performance Monitoring**: 10% sample rate for performance tracking
- **Session Replay**: 10% of sessions, 100% of sessions with errors
- **Release Tracking**: Tracks errors by app version
- **User Context**: Automatically attaches logged-in user info to errors
- **Breadcrumbs**: Tracks navigation and user actions leading to errors

### 4. Filtered Errors

The following errors are automatically filtered out:

- Cancelled network requests
- Browser extension errors
- ResizeObserver warnings
- Firebase permission-denied errors (handled in-app)
- Network errors in development

## Testing Sentry

### In Development

1. Open browser console
2. Run: `window.testSentryError()`
3. Check console for confirmation message

### In Production

1. Deploy with VITE_SENTRY_DSN configured
2. Errors will automatically be sent to Sentry
3. Check your Sentry dashboard for incoming errors

## Usage in Code

```typescript
import { captureException } from "@/services/monitoring/sentry";

try {
  // Your code
} catch (error) {
  captureException(error as Error, {
    context: "additional_info",
    userId: user.id,
    action: "specific_action",
  });
}
```

## Next Steps

- Implement root error boundary for better error UX
- Create structured logger service
- Add custom error tracking for business-critical features
