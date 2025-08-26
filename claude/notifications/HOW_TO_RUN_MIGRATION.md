# 📋 How to Run the Notification Migration Script

The migration script updates all existing notifications in the database to add the new read/unread tracking fields. You only need to run this **once**.

## 🎯 Recommended Method: Use the Migration Page

### Steps:
1. **Make sure your app is running** (`npm run dev`)
2. **Log in to your app**
3. **Navigate to:** `http://localhost:5173/run-migration`
4. **Click the "▶️ Run Migration" button**
5. **Wait for completion** (you'll see a success message)

### What You'll See:
- Clear instructions about what the migration does
- Real-time status updates
- Success/error messages
- Next steps after migration

## 🔧 Alternative Methods

### Method 2: Use NotificationTester Component (Development Only)

1. The NotificationTester component is already available in development mode
2. If you see it on any page, click **"Run Migration Script"** button
3. Wait for the success message

### Method 3: Browser Console

1. Open your app and log in
2. Open browser DevTools (F12)
3. Go to Console tab
4. Run this code:

```javascript
// Import and run the migration
import('@/migrations/migrateNotifications').then(module => {
  module.migrateExistingNotifications()
    .then(() => console.log('✅ Migration completed!'))
    .catch(error => console.error('❌ Migration failed:', error));
});
```

### Method 4: Add Temporary Button to Any Component

Add this code to any component where you're logged in:

```tsx
import { migrateExistingNotifications } from '@/migrations/migrateNotifications';
import { useState } from 'react';

// In your component:
const [migrating, setMigrating] = useState(false);

const handleMigration = async () => {
  setMigrating(true);
  try {
    await migrateExistingNotifications();
    alert('✅ Migration completed!');
  } catch (error) {
    alert('❌ Migration failed: ' + error.message);
  } finally {
    setMigrating(false);
  }
};

// In your JSX:
<button onClick={handleMigration} disabled={migrating}>
  {migrating ? 'Migrating...' : 'Run Migration'}
</button>
```

## ✅ What the Migration Does

1. **Finds all existing notifications** in the `inAppNotifications` collection
2. **Adds these fields if missing:**
   - `read: false` (marks all as unread initially)
   - `viewedInList: false`
   - `viewedInContext: false`
3. **Processes in batches** of 500 (Firestore limit)
4. **Shows progress** in console/UI

## ⚠️ Important Notes

- **Run only once** - Running multiple times won't break anything but is unnecessary
- **Must be logged in** - The migration needs authentication
- **Takes a few seconds** - Depending on notification count
- **Safe to run** - Won't delete or corrupt existing data

## 🔍 How to Verify Migration Success

After running the migration:

1. **Check notification badges** - Should show actual unread counts
2. **Click on notifications** - Should mark them as read
3. **Check console** for success message
4. **Test new notifications** - Create a new message, should appear as unread

## 🚨 Troubleshooting

### "User not found" error
- Make sure you're logged in before running migration

### "Permission denied" error
- Check Firestore security rules
- Make sure your user has write access to notifications

### Migration seems stuck
- Check browser console for errors
- Try refreshing and running again
- Check network tab for failed requests

### No visible changes
- Migration might have already been run
- Check if notifications already have `read` field
- Try creating a new notification to test

## 📊 Migration Status Check

To check if migration has been run, open browser console:

```javascript
// Check a sample notification
const { collection, getDocs, limit, query } = await import('firebase/firestore');
const { DB } = await import('@/controllers/db/config');
const { Collections } = await import('delib-npm');

const snapshot = await getDocs(
  query(collection(DB, Collections.inAppNotifications), limit(1))
);

if (!snapshot.empty) {
  const doc = snapshot.docs[0].data();
  console.log('Sample notification:', {
    hasReadField: 'read' in doc,
    hasViewedInList: 'viewedInList' in doc,
    hasViewedInContext: 'viewedInContext' in doc
  });
}
```

## 🎉 After Successful Migration

Your notification system is now ready with:
- ✅ Accurate unread counts
- ✅ Read/unread tracking
- ✅ Visual indicators for notification status
- ✅ Auto-mark as read functionality
- ✅ "Mark all as read" feature

---

**Need help?** Check the browser console for detailed error messages or refer to the implementation documentation.