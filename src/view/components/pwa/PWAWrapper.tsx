import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import InstallPWA from './InstallPWA';
import PWAUpdateToast from './PWAUpdateToast';
import NotificationPrompt from '../notifications/NotificationPrompt';

// Function to clear badge count
const clearBadgeCount = async () => {
  try {
    // Clear badge using standard or experimental APIs based on browser support
    if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    } else if ('clearExperimentalAppBadge' in navigator) {
      // @ts-ignore - Experimental API
      await navigator.clearExperimentalAppBadge();
    } else if ('ExperimentalBadge' in window) {
      // @ts-ignore - Experimental API
      await window.ExperimentalBadge.clear();
    }
    
    // Reset badge count in IndexedDB
    const openRequest = indexedDB.open('FreeDiNotifications', 1);
    openRequest.onsuccess = (event) => {
      // @ts-ignore - Type issues with event.target
      const db = event.target.result;
      const transaction = db.transaction('badgeCounter', 'readwrite');
      const store = transaction.objectStore('badgeCounter');
      store.put({ id: 'badge', count: 0 });
    };
  } catch (error) {
    console.error('Error clearing badge count:', error);
  }
};

interface PWAWrapperProps {
  children: React.ReactNode;
}

const PWAWrapper: React.FC<PWAWrapperProps> = ({ children }) => {
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  useEffect(() => {
    // Only set up the service worker in production
    if (import.meta.env.PROD) {
      // Clear badge when app is opened or focused
      clearBadgeCount();
      
      // Set up visibility change listener to clear badge when app comes into focus
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          clearBadgeCount();
          
          // Also tell the service worker to clear notifications
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'CLEAR_NOTIFICATIONS'
            });
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Explicitly register the Firebase Messaging Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/firebase-messaging-sw.js')
          .then(registration => {
            console.info('Firebase Messaging SW registered with scope:', registration.scope);
          })
          .catch(error => {
            console.error('Firebase Messaging SW registration failed:', error);
          });
      }
      
      const updateFunc = registerSW({
        onNeedRefresh() {
          // Dispatch custom event to notify components an update is available
          window.dispatchEvent(new CustomEvent('pwa:needRefresh'));
        },
        onOfflineReady() {
          console.info('App ready to work offline');
        },
        onRegisteredSW(swUrl, registration) {
          console.info(`Service Worker registered: ${swUrl}`);
          
          // Check for updates frequently to ensure clients get the latest version
          // This is the key requirement mentioned by the user - frequent update checks
          const updateInterval = setInterval(() => {
            console.info('Checking for Service Worker updates...');
            registration?.update().catch(err => {
              console.error('Error updating service worker:', err);
            });
          }, 60 * 1000); // Check every minute
          
          // Check if we should show notification prompt
          if ('Notification' in window && Notification.permission === 'default') {
            // Wait a bit before showing the notification prompt
            setTimeout(() => {
              setShowNotificationPrompt(true);
            }, 5000);
          }
          
          // Clean up interval and event listener when component unmounts
          return () => {
            clearInterval(updateInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
          };
        },
        onRegisterError(error) {
          console.error('Service worker registration error:', error);
        }
      });
      
      setUpdateSW(() => updateFunc);
      
      // Add event listeners for online/offline status
      window.addEventListener('online', () => {
        console.info('App is online. Checking for updates...');
        updateFunc(false).catch(console.error);
      });
      
      // Listen for notification permission changes
      const handlePermissionChange = () => {
        if (Notification.permission !== 'default') {
          setShowNotificationPrompt(false);
        }
      };
      
      // Try to listen for permission changes (not supported in all browsers)
      if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'notifications' as PermissionName })
          .then(permissionStatus => {
            permissionStatus.onchange = handlePermissionChange;
          })
          .catch(console.error);
      }
    }
  }, []);

  return (
    <>
      {children}
      <InstallPWA />
      {updateSW && <PWAUpdateToast registerUpdate={updateSW} />}
      {showNotificationPrompt && (
        <NotificationPrompt onClose={() => setShowNotificationPrompt(false)} />
      )}
    </>
  );
};

export default PWAWrapper;