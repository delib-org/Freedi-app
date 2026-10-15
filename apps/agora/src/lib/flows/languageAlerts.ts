import {
	isAgoraLanguagePlace,
	type AgoraLanguagePlace,
	type AgoraParticipant,
	type AgoraTeacherMessage,
} from '@freedi/shared-types';

/**
 * The teacher's language alerts, as data.
 *
 * The language gate files every refused text twice: a strike on the
 * participant doc (`languageStrikes`, `lastLanguageStrikeAt`) and a `system`
 * line of kind `language` on that student's private thread, holding the
 * words. Before this, the console only showed a small count inside the
 * Class side panel and a line inside the drawer — both behind a tap the
 * teacher had no reason to make, so a refused slur went unseen.
 *
 * An alert is a refusal the teacher has not acknowledged yet on this device.
 * Two readings, because a device may not hold the threads at all:
 *
 *   - PRIVATE (the teacher's phone): one alert per thread line, with the
 *     words, the place, the item — everything the teacher needs to act.
 *   - WALL (projected): only the participants' strike clocks, so the room
 *     learns that something was refused, never who or what.
 *
 * "Seen" is a single watermark per session: the newest refusal the teacher
 * acknowledged. Anything filed after it is still pending.
 */
export interface LanguageAlert {
	messageId: string;
	studentUid: string;
	createdAt: number;
	text: string;
	place?: AgoraLanguagePlace;
	itemId?: string;
	aboutStatementId?: string;
}

/** Pending refusals from the threads, newest first */
export function pendingLanguageAlerts(
	threads: ReadonlyMap<string, readonly AgoraTeacherMessage[]>,
	seenAt: number,
): LanguageAlert[] {
	const alerts: LanguageAlert[] = [];
	threads.forEach((thread) => {
		for (const line of thread) {
			if (line.kind !== 'language' || line.createdAt <= seenAt) continue;
			alerts.push({
				messageId: line.messageId,
				studentUid: line.studentUid,
				createdAt: line.createdAt,
				text: line.removedText ?? '',
				...(isAgoraLanguagePlace(line.languagePlace) ? { place: line.languagePlace } : {}),
				...(line.languageItemId ? { itemId: line.languageItemId } : {}),
				...(line.aboutStatementId ? { aboutStatementId: line.aboutStatementId } : {}),
			});
		}
	});

	return alerts.sort((a, b) => b.createdAt - a.createdAt);
}

/** On a wall: how many students were refused since the watermark — no names */
export function pendingWallStrikes(
	participants: readonly Pick<AgoraParticipant, 'lastLanguageStrikeAt'>[],
	seenAt: number,
): { count: number; latest: number } {
	let count = 0;
	let latest = 0;
	for (const participant of participants) {
		const at = participant.lastLanguageStrikeAt ?? 0;
		if (at <= seenAt) continue;
		count++;
		latest = Math.max(latest, at);
	}

	return { count, latest };
}

/** The i18n key that says where the text was being written */
export function languagePlaceKey(place: AgoraLanguagePlace | undefined): string {
	return place ? `teacher.language_alert.place_${place}` : 'teacher.language_alert.place_unknown';
}

// ---- the watermark — the teacher's own device, so localStorage is enough ----

/** The two calls the watermark needs — injectable so it is tested in node */
export type SeenStorage = Pick<Storage, 'getItem' | 'setItem'>;

function seenKey(sessionId: string): string {
	return `agora_${sessionId}_languageseen`;
}

function defaultStorage(): SeenStorage {
	return globalThis.localStorage;
}

export function readLanguageSeen(sessionId: string, storage?: SeenStorage): number {
	try {
		const raw = (storage ?? defaultStorage()).getItem(seenKey(sessionId));
		const value = raw ? Number(raw) : 0;

		return Number.isFinite(value) ? value : 0;
	} catch {
		return 0;
	}
}

/** Never moves backwards: acknowledging an old alert cannot re-open newer ones */
export function markLanguageSeen(sessionId: string, at: number, storage?: SeenStorage): number {
	const next = Math.max(readLanguageSeen(sessionId, storage), at);
	try {
		(storage ?? defaultStorage()).setItem(seenKey(sessionId), String(next));
	} catch {
		// Storage refused — the alert stays for this sitting, which is the safe side
	}

	return next;
}
