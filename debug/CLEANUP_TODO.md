# Debug Files to Remove

These debug files were added to troubleshoot the admin invitation issue with work emails (Google Workspace accounts).

## Issue
- Gmail users could be invited as admins successfully
- Work email users (e.g., `tal.yaron@wizcol.com`, `guy@q4israel.org.il`) couldn't get admin access
- Root cause: NetworkError during auto-accept after login (page navigation canceled the fetch)
- Fix: Changed to use `navigator.sendBeacon()` which survives page navigation

## Files to Remove After Verification

### 1. Debug API Endpoints (apps/sign)
```
apps/sign/app/api/debug/invitations/route.ts   - Check invitation status by email
apps/sign/app/api/debug/accept/route.ts        - Manually accept invitations
```

### 2. Debug Logging (can be removed or kept)
The following files have `[DEBUG]` logging that can be removed:

```
apps/sign/app/api/invite/accept/route.ts              - Lines with [DEBUG]
apps/sign/app/api/auth/accept-pending-invitations/route.ts - Lines with [DEBUG]
apps/sign/app/api/admin/invitations/[docId]/route.ts  - Lines with [DEBUG]
apps/sign/src/lib/firebase/client.ts                  - Lines with [DEBUG]
```

## How to Remove

Ask Claude: "Remove the debug files listed in /debug/CLEANUP_TODO.md"

## Date Added
2026-01-17
