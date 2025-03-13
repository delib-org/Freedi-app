import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import InstallPWA from './InstallPWA';
import PWAUpdateToast from './PWAUpdateToast';

interface PWAWrapperProps {
  children: React.ReactNode;
}

const PWAWrapper: React.FC<PWAWrapperProps> = ({ children }) => {
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Only set up the service worker in production
    if (import.meta.env.PROD) {
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
          
          // Clean up interval when component unmounts
          return () => clearInterval(updateInterval);
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
    }
  }, []);

  return (
    <>
      {children}
      <InstallPWA />
      {updateSW && <PWAUpdateToast registerUpdate={updateSW} />}
    </>
  );
};

export default PWAWrapper;