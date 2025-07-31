import React from 'react';
import FCMTokenDisplay from './FCMTokenDisplay';

/**
 * Component to test FCM notifications
 * Add this component wherever needed for testing
 */
const NotificationTester: React.FC = () => {
  // Only show in development mode
  if (!import.meta.env.DEV) return null;

  return <FCMTokenDisplay />;
};

export default NotificationTester;