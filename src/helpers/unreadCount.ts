import { NOTIFICATION } from '@/constants/common';

/** The unread number as people should read it: exact up to the cap, then "99+". */
export function formatUnreadCount(
	count: number,
	max: number = NOTIFICATION.UNREAD_DISPLAY_MAX,
): string {
	return count > max ? `${max}+` : String(count);
}
