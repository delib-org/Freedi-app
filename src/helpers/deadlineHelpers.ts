/**
 * Formats remaining milliseconds into a human-readable countdown string.
 */
export function formatTimeRemaining(ms: number): string {
	if (ms <= 0) return '0s';

	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		const remainingHours = hours % 24;

		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}

	if (hours > 0) {
		const remainingMinutes = minutes % 60;

		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}

	if (minutes > 0) {
		const remainingSeconds = seconds % 60;

		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}

	return `${seconds}s`;
}
