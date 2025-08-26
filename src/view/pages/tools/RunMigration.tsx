import React, { useState } from 'react';
import { migrateExistingNotifications } from '@/migrations/migrateNotifications';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

/**
 * One-time migration page for updating existing notifications
 * Navigate to /run-migration to access this page
 */
const RunMigration: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState('');
  const { user } = useAuthentication();

  const runMigration = async () => {
    if (!user) {
      setMessage('Please log in first');
      return;
    }

    setStatus('running');
    setMessage('Migration in progress...');
    setDetails('This may take a few moments depending on the number of notifications.');

    try {
      const result = await migrateExistingNotifications();
      setStatus('success');
      
      if (result.updated === 0 && result.skipped > 0) {
        setMessage('✅ No migration needed!');
        setDetails(`All ${result.skipped} notifications already have the required fields.`);
      } else if (result.updated > 0) {
        setMessage('✅ Migration completed successfully!');
        let detailsMsg = `Updated ${result.updated} notifications with read/unread status.`;
        if (result.skipped > 0) {
          detailsMsg += ` Skipped ${result.skipped} already migrated notifications.`;
        }
        if (result.errors > 0) {
          detailsMsg += ` ${result.errors} notifications had errors (check console).`;
        }
        setDetails(detailsMsg);
      } else {
        setMessage('✅ No notifications found to migrate');
        setDetails('Your database has no notifications yet.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('❌ Migration failed');
      
      // Better error messages
      if (error.message?.includes('userId')) {
        setDetails('Some notifications have missing userId field. This is normal for old data. The migration will handle it.');
      } else if (error.message?.includes('permission')) {
        setDetails('Permission denied. Make sure you are logged in and have access to notifications.');
      } else {
        setDetails(error.message || 'An unknown error occurred. Check the console for details.');
      }
      
      console.error('Migration error:', error);
    }
  };

  const styles = {
    container: {
      maxWidth: '600px',
      margin: '50px auto',
      padding: '30px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    title: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '20px',
      color: '#333'
    },
    description: {
      marginBottom: '20px',
      lineHeight: '1.6',
      color: '#666'
    },
    button: {
      padding: '12px 24px',
      fontSize: '16px',
      backgroundColor: '#4CAF50',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      disabled: {
        backgroundColor: '#ccc',
        cursor: 'not-allowed'
      }
    },
    status: {
      marginTop: '20px',
      padding: '15px',
      borderRadius: '4px',
      backgroundColor: {
        idle: 'transparent',
        running: '#e3f2fd',
        success: '#e8f5e9',
        error: '#ffebee'
      },
      color: {
        idle: '#333',
        running: '#1976d2',
        success: '#2e7d32',
        error: '#c62828'
      }
    },
    details: {
      marginTop: '10px',
      fontSize: '14px',
      color: '#777'
    },
    warning: {
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '4px',
      padding: '10px',
      marginBottom: '20px',
      color: '#856404'
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🔄 Notification Migration Tool</h1>
      
      <div style={styles.description}>
        <p>This tool updates all existing notifications in the database to include the new read/unread tracking fields.</p>
        <p><strong>What it does:</strong></p>
        <ul>
          <li>Sets all existing notifications as unread (read: false)</li>
          <li>Adds viewedInList and viewedInContext fields</li>
          <li>Prepares notifications for the new tracking system</li>
        </ul>
      </div>

      <div style={styles.warning}>
        ⚠️ <strong>Important:</strong> Run this migration only once. Running it multiple times won't cause issues but is unnecessary.
      </div>

      {!user ? (
        <div style={{ ...styles.status, backgroundColor: '#ffebee', color: '#c62828' }}>
          Please log in to run the migration
        </div>
      ) : (
        <>
          <button
            style={{
              ...styles.button,
              ...(status === 'running' ? styles.button.disabled : {})
            }}
            onClick={runMigration}
            disabled={status === 'running'}
          >
            {status === 'running' ? '⏳ Running Migration...' : '▶️ Run Migration'}
          </button>

          {status !== 'idle' && (
            <div style={{
              ...styles.status,
              backgroundColor: styles.status.backgroundColor[status],
              color: styles.status.color[status]
            }}>
              <div>{message}</div>
              {details && <div style={styles.details}>{details}</div>}
            </div>
          )}

          {status === 'success' && (
            <div style={{ marginTop: '20px' }}>
              <h3>✅ Next Steps:</h3>
              <ol>
                <li>Test the notification system with new messages</li>
                <li>Verify that notification counts are accurate</li>
                <li>Check that clicking notifications marks them as read</li>
              </ol>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '40px', fontSize: '12px', color: '#999' }}>
        <p>User: {user?.displayName || 'Not logged in'}</p>
        <p>User ID: {user?.uid || 'N/A'}</p>
        <p>Environment: {import.meta.env.MODE}</p>
      </div>
    </div>
  );
};

export default RunMigration;