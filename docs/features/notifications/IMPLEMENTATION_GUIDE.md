# Notification System Implementation Guide

## Overview

This guide explains how to implement the improved notification system that addresses the common issues causing failed push notifications.

## Files Created

1. **`/functions/src/fn_notifications_improved.ts`** - Enhanced server-side notification handling
2. **`/src/services/notificationService_improved.ts`** - Enhanced client-side notification service
3. **`/src/view/components/notifications/NotificationDiagnostics.tsx`** - Diagnostic component for users

## Key Improvements

### 1. Token Validation (Server-Side)
- Validates tokens before sending notifications using dry-run
- Removes invalid tokens from database automatically
- Prevents wasted API calls to invalid tokens

### 2. Error Handling & Retry Logic
- Specific handling for different FCM error codes
- Exponential backoff retry for temporary failures
- Automatic cleanup of permanently failed tokens

### 3. Token Refresh (Client-Side)
- Automatic token refresh every 30 days
- Token freshness checking on app startup
- Manual refresh option for users

### 4. Diagnostics Tool
- User-facing diagnostic component
- Shows notification setup status
- Provides troubleshooting tips
- Test notification feature

## Implementation Steps

### Step 1: Update Server-Side Code

Replace the content of `/functions/src/fn_notifications.ts` with the improved version:

```bash
cp /Users/talyaron/Documents/Freedi-app/functions/src/fn_notifications_improved.ts /Users/talyaron/Documents/Freedi-app/functions/src/fn_notifications.ts
```

Or rename the improved file:
```bash
mv /Users/talyaron/Documents/Freedi-app/functions/src/fn_notifications_improved.ts /Users/talyaron/Documents/Freedi-app/functions/src/fn_notifications.ts
```

### Step 2: Update Client-Side Service

Replace the content of `/src/services/notificationService.ts` with the improved version:

```bash
cp /Users/talyaron/Documents/Freedi-app/src/services/notificationService_improved.ts /Users/talyaron/Documents/Freedi-app/src/services/notificationService.ts
```

Or rename the improved file:
```bash
mv /Users/talyaron/Documents/Freedi-app/src/services/notificationService_improved.ts /Users/talyaron/Documents/Freedi-app/src/services/notificationService.ts
```

### Step 3: Add Diagnostics Component

The diagnostics component is already in place at:
```
/Users/talyaron/Documents/Freedi-app/src/view/components/notifications/NotificationDiagnostics.tsx
```

2. Add it to your settings or help page:
```tsx
import { NotificationDiagnostics } from '@/view/components/notifications/NotificationDiagnostics';

// In your component
<NotificationDiagnostics />
```

### Step 4: Update Logout Handler

Add cleanup to your logout function:

```typescript
// In your logout handler
await notificationService.cleanup();
```

### Step 5: Create Test Notification Endpoint (Optional)

Create a Firebase function for testing notifications:

```typescript
export const testNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { token } = data;
  
  try {
    await admin.messaging().send({
      token,
      notification: {
        title: 'Test Notification',
        body: 'This is a test notification from FreeDi'
      },
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    });
    
    return { success: true };
  } catch (error) {
    logger.error('Test notification failed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send test notification');
  }
});
```

## Migration Considerations

### Database Changes

No schema changes required, but consider:

1. **Cleanup Script**: Run a one-time cleanup of invalid tokens
2. **Add Indexes**: Add indexes on `userId` and `token` fields for better query performance

### Monitoring

Add monitoring for:
- Token validation success rate
- Notification delivery rate
- Token age distribution
- Error frequencies by type

### Testing

1. **Unit Tests**: Test token validation logic
2. **Integration Tests**: Test full notification flow
3. **Manual Testing**:
   - Test with expired tokens
   - Test with invalid tokens
   - Test retry logic
   - Test token refresh

## Performance Impact

- **Token Validation**: Adds ~100-200ms per batch due to dry-run checks
- **Retry Logic**: May increase total send time for failed messages
- **Token Refresh**: Minimal impact, runs periodically in background

## Rollback Plan

If issues arise:
1. Revert to original `fn_notifications.ts`
2. Revert to original `notificationService.ts`
3. Remove diagnostics component

## Future Enhancements

1. **Analytics Dashboard**: Track notification metrics
2. **A/B Testing**: Test different notification strategies
3. **Smart Batching**: Optimize batch sizes based on success rates
4. **Token Health Monitoring**: Proactive token refresh based on patterns

## Common Issues & Solutions

### Issue: High token validation overhead
**Solution**: Cache validation results for 24 hours

### Issue: Users complain about missing notifications
**Solution**: Direct them to the diagnostics tool

### Issue: Token refresh causing duplicate tokens
**Solution**: Implemented deduplication in token storage

### Issue: Service worker conflicts
**Solution**: Ensure proper SW registration order in PWAWrapper