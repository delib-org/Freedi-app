export {};
declare global {
	var FreeDiBadgeStore: {
		update(options: {
			count?: number;
			userId?: string | null;
			notificationIds?: string[];
			notificationId?: string;
		}): Promise<{ count: number; userId?: string | null; signedOut?: boolean }>;
		apply(count: number): Promise<void>;
	};
}
