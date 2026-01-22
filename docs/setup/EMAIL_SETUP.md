# Email Setup for Feedback Feature (Using Nodemailer)

## Quick Setup for Local Development (Gmail)

### Step 1: Generate Gmail App Password
1. Go to https://myaccount.google.com/security
2. Enable 2-factor authentication (if not already enabled)
3. Click on "2-Step Verification"
4. Scroll down to "App passwords"
5. Generate a new app password for "Mail"
6. Copy the 16-character password (ignore spaces)

### Step 2: Create .env file
```bash
cd functions
cp .env.example .env
```

### Step 3: Edit .env file
```env
EMAIL_USER=your.email@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Your app password from Step 1
EMAIL_SERVICE=gmail
```

### Step 4: Load environment variables
```bash
# For local development with emulator
source .env  # On Mac/Linux
# OR
set -a; source .env; set +a  # Alternative method
```

### Step 5: Run the emulator
```bash
firebase emulators:start --only functions,firestore
```

### Step 6: Test
1. Go to your local app (http://localhost:5173)
2. Navigate to a Mass Consensus process
3. Go through the steps to the feedback page
4. Submit feedback with text
5. Check your Firebase Functions logs for success/errors

## Production Setup

### Option 1: Firebase Functions Config (Recommended)
```bash
# Set email credentials
firebase functions:config:set email.user="your.email@gmail.com"
firebase functions:config:set email.password="your-app-password"

# Deploy
firebase deploy --only functions
```

### Option 2: Environment Variables in Firebase Console
1. Go to Firebase Console → Functions
2. Click on Settings (gear icon)
3. Add environment variables:
   - `EMAIL_USER`
   - `EMAIL_PASSWORD`

## Troubleshooting

### Check if feedback is being saved
1. Open Firebase Console
2. Go to Firestore Database
3. Look for `feedback` collection
4. You should see documents with feedback data

### Check function logs
```bash
# Local
firebase emulators:start
# Then check http://localhost:5002/functions

# Production
firebase functions:log --only addFeedback
```

### Common Issues

#### "Email credentials not configured"
- Make sure .env file exists in functions folder
- Check that EMAIL_USER and EMAIL_PASSWORD are set
- For emulator, ensure environment variables are loaded

#### "Invalid login" or authentication error
- Make sure you're using an App Password, not your regular Gmail password
- Verify 2-factor authentication is enabled on your Gmail account
- Check that the app password is entered correctly (no spaces)

#### Email not received
- Check spam/junk folder
- Verify tal.yaron@gmail.com is the correct recipient
- Check function logs for any errors

## Testing Without Email (Development)

If you just want to test without setting up email, the function will:
1. Save feedback to Firestore ✅
2. Log the email content to console 📝
3. Show a warning that email is not configured ⚠️

This is perfect for development and testing!

## Email Content Preview

When a user submits feedback, tal.yaron@gmail.com will receive:

```
Subject: New Feedback: [Statement Title]

Statement: [Title]
Statement ID: [ID]
User: [Display Name] (uid)
User Email: [If provided]
Date: [Timestamp]

Feedback:
[User's feedback text]
```