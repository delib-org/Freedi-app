# Email Setup for Feedback Feature (Updated to use Nodemailer)

## Current Status
The feedback feature is saving data to Firestore but emails are not being sent because SendGrid is not configured.

## Setup Instructions

### Option 1: Using SendGrid (Recommended for Production)

1. **Create SendGrid Account**
   - Go to https://sendgrid.com
   - Sign up for a free account (100 emails/day free)

2. **Get API Key**
   - In SendGrid Dashboard, go to Settings → API Keys
   - Click "Create API Key"
   - Choose "Full Access" or "Restricted Access" with Mail Send permissions
   - Copy the API key (starts with `SG.`)

3. **Verify Sender Email**
   - Go to Settings → Sender Authentication
   - Verify the domain `freedi.tech` OR
   - Add a Single Sender Verification for `noreply@freedi.tech`

4. **Set API Key in Firebase Functions**

   For local development:
   ```bash
   cd functions
   firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY"
   ```

   For production:
   ```bash
   firebase functions:config:set sendgrid.api_key="YOUR_SENDGRID_API_KEY" --project your-production-project
   firebase deploy --only functions
   ```

5. **Update Local Environment**
   ```bash
   # Get the config for local development
   firebase functions:config:get > functions/.runtimeconfig.json
   ```

### Option 2: Using Firebase Email Extension (Simpler)

1. **Install Firebase Email Extension**
   ```bash
   firebase ext:install firebase/firestore-send-email
   ```

2. **Configure during installation:**
   - SMTP connection URI: Use SendGrid, Mailgun, or any SMTP service
   - Email documents collection: `mail`
   - Default FROM address: `noreply@freedi.tech`

3. **Update the feedback function to use the extension** (requires code change)

### Option 3: For Testing Only - Use Console Logging

The function already logs feedback details when no SendGrid key is configured. Check Firebase Functions logs:

```bash
firebase functions:log
```

Or in the Firebase Console:
1. Go to Firebase Console
2. Navigate to Functions → Logs
3. Look for "Feedback details that would be emailed"

## Testing After Setup

1. **Test locally with emulator:**
   ```bash
   cd functions
   npm run serve
   ```

2. **Send test feedback through the app**

3. **Check logs:**
   ```bash
   firebase functions:log --only addFeedback
   ```

## Troubleshooting

### Email not sending checklist:
- [ ] SendGrid API key is set in Firebase config
- [ ] Sender email is verified in SendGrid
- [ ] API key has Mail Send permissions
- [ ] `.runtimeconfig.json` exists for local development
- [ ] Function is deployed after config changes

### View current config:
```bash
firebase functions:config:get
```

### Check function logs:
```bash
firebase functions:log --only addFeedback
```

## Environment Variables Needed

Add to `functions/.env.local` for local development:
```
SENDGRID_API_KEY=SG.your_actual_api_key_here
```

Or use Firebase config (recommended):
```bash
firebase functions:config:set sendgrid.api_key="SG.your_actual_api_key_here"
```

## Current Behavior Without Email Setup

When SendGrid is not configured, the function:
1. ✅ Saves feedback to Firestore collection `feedback`
2. ✅ Logs feedback details in console
3. ⚠️ Shows warning: "SendGrid API key not configured. Email notification skipped."
4. ✅ Returns success to the frontend

The feedback is still being saved successfully even without email!