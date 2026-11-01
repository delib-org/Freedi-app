/**
 * The name the class sees for this student: the Firebase name, else (for an
 * anonymous student) the name typed on this device. Empty when neither is known.
 * The device name matters: a student who typed it in an earlier class is never
 * asked again, and the table screens read names off the subscription.
 */
export function resolveSubscriptionName(
	user: { displayName?: string | null; isAnonymous?: boolean } | null | undefined,
	deviceName: string | null,
): string {
	const own = user?.displayName?.trim();
	if (own) return own;

	return user?.isAnonymous === false ? '' : (deviceName?.trim() ?? '');
}
