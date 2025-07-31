# Push Notification Issues & Todo List

## Summary of Current Issues

### 1. Token Management Problems
- **No token validation**: Server sends to potentially invalid/expired tokens
- **No automatic refresh**: Tokens can expire without being renewed
- **No cleanup mechanism**: Old tokens remain in database indefinitely
- **Duplicate tokens**: Multiple tokens per user across devices not properly managed
- **Two collections**: Tokens split between `pushNotifications` and `askedToBeNotified`

### 2. Error Handling Gaps
- **No retry logic**: Failed FCM sends are only logged, not retried
- **Generic error handling**: No specific handling for different FCM error types
- **Silent failures**: Users not notified when notifications fail
- **No monitoring**: No tracking of delivery success rates

### 3. Service Worker Issues
- **Dual service workers**: Potential conflicts between `sw.js` and `firebase-messaging-sw.js`
- **Registration failures**: No recovery mechanism if SW registration fails
- **Badge sync issues**: IndexedDB badge count can get out of sync

### 4. Browser Compatibility
- **Limited iOS support**: Safari PWA notifications have restrictions
- **No graceful degradation**: Missing fallbacks for unsupported browsers
- **Permission handling**: No re-prompt strategy for denied permissions

### 5. FCM Limitations Not Handled
- **Batch size**: No enforcement of 500 message limit per batch
- **Rate limiting**: No consideration for FCM rate limits
- **Quota management**: No handling of daily quota limits

## Todo List

### Priority 1: Critical Fixes (Implement First)

- [ ] **Implement token validation and cleanup**
  - Add function to validate tokens before sending
  - Remove invalid tokens from database on FCM errors
  - Handle specific FCM error codes:
    - `messaging/registration-token-not-registered`
    - `messaging/invalid-registration-token`
    - `messaging/token-unsubscribe`

- [ ] **Add retry mechanism for failed notifications**
  - Implement exponential backoff for retries
  - Set maximum retry attempts (e.g., 3)
  - Log persistent failures for investigation

- [ ] **Fix token refresh logic**
  - Refresh tokens on app startup
  - Implement periodic token refresh (every 30 days)
  - Update token in all relevant collections

### Priority 2: Important Improvements

- [ ] **Improve error handling in fn_notifications.ts**
  ```typescript
  // Example structure:
  try {
    const response = await admin.messaging().send(message);
  } catch (error) {
    if (error.code === 'messaging/registration-token-not-registered') {
      // Remove token from database
    } else if (error.code === 'messaging/invalid-registration-token') {
      // Mark token as invalid
    } else if (error.code === 'messaging/message-rate-exceeded') {
      // Implement backoff and retry
    }
  }
  ```

- [ ] **Implement token management service**
  - Create unified token storage (single collection)
  - Add token metadata (created, lastUsed, deviceInfo)
  - Implement token rotation strategy
  - Add cleanup on user logout

- [ ] **Add notification delivery monitoring**
  - Track send attempts and successes
  - Create dashboard for notification metrics
  - Alert on high failure rates

### Priority 3: User Experience Enhancements

- [ ] **Create notification diagnostics page**
  - Show current permission status
  - Display active FCM token
  - Test notification button with feedback
  - Show last notification received
  - Browser compatibility check

- [ ] **Improve permission request flow**
  - Explain why notifications are needed
  - Add "remind me later" option
  - Re-prompt strategy for previously denied

- [ ] **Add user notification preferences**
  - Granular control over notification types
  - Quiet hours setting
  - Notification frequency limits

### Priority 4: Technical Debt

- [ ] **Consolidate service worker logic**
  - Review need for dual service workers
  - Ensure proper SW update handling
  - Fix badge count synchronization

- [ ] **Implement proper FCM batch handling**
  ```typescript
  const fcmBatchSize = 500;
  const results = [];
  for (let i = 0; i < fcmMessages.length; i += fcmBatchSize) {
    const batch = fcmMessages.slice(i, i + fcmBatchSize);
    const batchResults = await admin.messaging().sendAll(batch);
    results.push(...batchResults.responses);
  }
  ```

- [ ] **Add comprehensive logging**
  - Log all notification events
  - Include user context in logs
  - Add performance metrics

### Priority 5: Future Enhancements

- [ ] **Implement notification analytics**
  - Click-through rates
  - Time to interaction
  - User engagement metrics

- [ ] **Add A/B testing for notifications**
  - Test different message formats
  - Optimize send times
  - Measure impact on engagement

- [ ] **Create notification templates**
  - Consistent formatting
  - Localization support
  - Rich media support

## Implementation Guidelines

1. **Start with Priority 1** - These fix the most critical issues affecting delivery
2. **Test thoroughly** - Each fix should be tested across different browsers/devices
3. **Monitor impact** - Track notification delivery rates before/after changes
4. **Document changes** - Update relevant documentation as fixes are implemented
5. **Gradual rollout** - Consider feature flags for major changes

## Success Metrics

- **Delivery rate**: Target >95% successful delivery for valid tokens
- **Token freshness**: 100% of active tokens refreshed within 30 days
- **Error handling**: 0% silent failures (all errors logged/handled)
- **User satisfaction**: Reduced complaints about missing notifications

## Testing Checklist

- [ ] Test on Chrome, Firefox, Safari, Edge
- [ ] Test on iOS Safari (PWA limitations)
- [ ] Test with app in foreground/background/closed
- [ ] Test token expiration scenarios
- [ ] Test error recovery mechanisms
- [ ] Test with poor network conditions
- [ ] Test notification click handling
- [ ] Test badge count accuracy