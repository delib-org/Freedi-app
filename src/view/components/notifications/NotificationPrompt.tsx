import React, { useState, useEffect } from 'react';
import styles from './notificationPrompt.module.scss';
import useNotifications from '@/controllers/hooks/useNotifications';

interface NotificationPromptProps {
  onClose?: () => void;
}

/**
 * A component that prompts the user to enable notifications
 */
const NotificationPrompt: React.FC<NotificationPromptProps> = ({ onClose }) => {
  const [visible, setVisible] = useState(false);
  const { permissionState, requestPermission } = useNotifications();
  
  // Check if we should show the notification prompt
  useEffect(() => {
    // Only show the prompt if permission is not granted and not denied
    if (permissionState.permission === 'default' && !permissionState.loading) {
      // Don't show the prompt immediately, wait a bit for better user experience
      const timer = setTimeout(() => {
        setVisible(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [permissionState.permission, permissionState.loading]);
  
  // Handle permission request
  const handleEnableClick = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      // Show a test notification
      // setTimeout(() => {
      //   sendTestNotification();
      // }, 1000);
    }
    setVisible(false);
    onClose?.();
  };
  
  // Handle dismissal
  const handleDismissClick = () => {
    setVisible(false);
    onClose?.();
  };
  
  if (!visible) return null;
  
  return (
    <div className={styles.notificationPrompt}>
      <div className="notification-prompt-content">
        <div className="notification-prompt-icon">
          <img src="/icons/logo-96px.png" alt="FreeDi App" />
        </div>
        <div className="notification-prompt-message">
          <h3>Stay Updated</h3>
          <p>Would you like to receive notifications about new activities and updates?</p>
        </div>
        <div className="notification-prompt-actions">
          <button 
            onClick={handleDismissClick}
            className={styles.notificationPromptDismiss}
          >
            Not Now
          </button>
          <button 
            onClick={handleEnableClick}
            className={styles.notificationPromptEnable}
          >
            Enable Notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPrompt;