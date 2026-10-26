import m from 'mithril';
import { CLASS_LANGUAGE_FLAGS_COLLECTION } from '@freedi/shared-types';
import type { ClassLanguageFlag } from '@freedi/shared-types';
import { collection, db, doc, query, updateDoc, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';

/**
 * Firestore access of the teacher's language flags (IA 24.4). The flags are
 * written by the classroom callables only; the rules let just the lesson's
 * admins read them and set `seenAt`. One listener per open console. The
 * attempted text lives only in this module's state and on the teacher's
 * screen: it is never logged.
 */

const LISTENER = 'classLanguageFlags';

export const flagState: { flags: ClassLanguageFlag[]; revealed: Set<string> } = {
	flags: [],
	revealed: new Set<string>(),
};

/** Start the lesson's flag listener; returns its stop. */
export function watchLanguageFlags(mainId: string): Unsubscribe {
	flagState.flags = [];
	flagState.revealed = new Set<string>();
	const stop = resilientOnSnapshot(
		`${LISTENER}:${mainId}`,
		query(collection(db, CLASS_LANGUAGE_FLAGS_COLLECTION), where('mainId', '==', mainId)),
		(snap) => {
			flagState.flags = snap.docs.map((d) => d.data() as ClassLanguageFlag);
			m.redraw();
		},
		(error) =>
			console.error(
				'[TeacherFlags] listener error',
				{ operation: 'languageFlags.watch', mainId },
				error,
			),
	);

	return () => {
		stop();
		flagState.flags = [];
		flagState.revealed = new Set<string>();
	};
}

/** The teacher saw these attempts: they leave the line and the badge. */
export async function markFlagsSeen(
	flagIds: readonly string[],
	mainId: string,
	at: number = Date.now(),
): Promise<void> {
	try {
		await Promise.all(
			flagIds.map((id) => updateDoc(doc(db, CLASS_LANGUAGE_FLAGS_COLLECTION, id), { seenAt: at })),
		);
	} catch (error) {
		console.error(
			'[TeacherFlags] mark seen failed',
			{ operation: 'languageFlags.seen', mainId },
			error,
		);
		throw error;
	}
}
