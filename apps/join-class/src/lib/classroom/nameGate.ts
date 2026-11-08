import type { StatementSubscription } from '@freedi/shared-types';
import { resolveSubscriptionName } from './subscriptionName';

/**
 * Does this student's phone owe the class a name? Asked at EVERY step, not only
 * at the waiting step, so a student who joined late, whose name was never saved,
 * or who cleared the phone's storage still gets a form (Trello dZQmKXRY).
 *
 * The teacher can also ask for a new name at any step (`renameRequested`, Trello 0afoikKD).
 *
 * The name that counts is the one on their subscription, because that is what the
 * teacher's board and the table screens read. A name typed earlier on this phone
 * counts too: the subscription is patched from it on the next visit.
 */

export interface NameGateInput {
	/** The signed-in Firebase user; null before sign-in has finished (nothing to ask yet). */
	user: { displayName?: string | null; isAnonymous?: boolean } | null;
	/** The name typed earlier on this phone, if any. */
	deviceName: string | null;
	/** The student's subscription; null = it does not exist (yet). */
	sub: Pick<StatementSubscription, 'user' | 'renameRequested'> | null;
	/** The listener on the subscription has answered at least once. */
	subLoaded: boolean;
}

export function needsNameForm(input: NameGateInput): boolean {
	const { user, deviceName, sub, subLoaded } = input;
	if (!user) return false;
	// The teacher asked for a new name: the form stays until the student saves one.
	if (sub?.renameRequested === true) return true;
	// Until the subscription has answered we cannot tell "no name" from "not loaded yet".
	if (!subLoaded) return false;
	if (sub?.user?.displayName?.trim()) return false;

	return resolveSubscriptionName(user, deviceName) === '';
}
