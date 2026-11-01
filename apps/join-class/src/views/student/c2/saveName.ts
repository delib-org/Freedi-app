import { Collections, getStatementSubscriptionId } from '@freedi/shared-types';
import { db, doc, updateDoc } from '@/lib/firebase';
import { setCustomDisplayName } from '@/lib/store';
import { ensureMemberSubscription } from '@/lib/classroom/studentWrites';
import { getUserState } from '@/lib/user';

/**
 * A student types their name once (kept on the device like Join's chat name)
 * and the teacher's roster shows it: the name is written onto the member
 * subscription's `user.displayName`.
 */
export async function saveMyName(mainId: string, rawName: string): Promise<void> {
	const name = rawName.trim();
	if (!name) return;
	setCustomDisplayName(name);
	try {
		const uid = getUserState().user?.uid;
		if (!uid) throw new Error('no signed-in user');
		await ensureMemberSubscription(mainId);
		const subId =
			getStatementSubscriptionId(mainId, { uid } as Parameters<
				typeof getStatementSubscriptionId
			>[1]) ?? `${uid}--${mainId}`;
		await updateDoc(doc(db, Collections.statementsSubscribe, subId), {
			'user.displayName': name,
			lastUpdate: Date.now(),
		});
	} catch (error) {
		console.error('[Classroom] saveMyName failed:', error);
		throw error;
	}
}
