/**
 * Helper functions for handling notifications with missing 'read' field
 * Temporary utilities for local development
 */

import { NotificationType } from 'delib-npm';

/**
 * Check if a notification should be considered unread
 * Treats notifications without 'read' field as unread
 */
export function isNotificationUnread(notification: any): boolean {
  // If read field doesn't exist, treat as unread (for backward compatibility)
  if (!('read' in notification)) {
    console.info('Notification missing read field, treating as unread:', notification.notificationId);
    return true;
  }
  // Otherwise check if it's explicitly false
  return notification.read === false;
}

/**
 * Filter notifications to get only unread ones
 * Handles missing 'read' field gracefully
 */
export function filterUnreadNotifications(
  notifications: NotificationType[], 
  creatorId?: string
): NotificationType[] {
  return notifications.filter(n => {
    // Filter out current user's notifications
    if (creatorId && n.creatorId === creatorId) {
      return false;
    }
    // Check if unread (including missing field)
    return isNotificationUnread(n);
  });
}

/**
 * Get unread count with fallback
 */
export function getUnreadCount(
  notifications: NotificationType[],
  creatorId?: string,
  parentId?: string
): number {
  let filtered = filterUnreadNotifications(notifications, creatorId);
  
  // If filtering by parentId (for statement-specific counts)
  if (parentId) {
    filtered = filtered.filter(n => n.parentId === parentId);
  }
  
  return filtered.length;
}

/**
 * Ensure notification has all required fields
 * Adds missing fields with defaults
 */
export function ensureNotificationFields(notification: any): NotificationType {
  return {
    ...notification,
    read: notification.read ?? false,
    viewedInList: notification.viewedInList ?? false,
    viewedInContext: notification.viewedInContext ?? false,
  };
}

/**
 * Process notifications array to ensure all have required fields
 */
export function processNotifications(notifications: any[]): NotificationType[] {
  return notifications.map(ensureNotificationFields);
}