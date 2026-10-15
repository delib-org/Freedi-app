import { AgoraSession } from '@freedi/shared-types';
import { getLang, t } from './i18n';
import { classLabel } from './teacher';
import { getTopicPackage, loadTopicPackage } from './topic';

/**
 * The words a lesson is called by on the teacher's screens: its scenario's
 * title (or the question an own-question lesson asked) and its class. Shared
 * by the home's live banner, the class's lessons and the past-lessons page so
 * a lesson has one name wherever it is listed.
 */

/**
 * The lesson's own name. Null until its scenario has loaded — the call asks
 * for it, and the screen redraws when it lands.
 */
export function lessonTitle(session: AgoraSession): string | null {
	const topic = getTopicPackage(session.topicPackageId);
	if (!topic) {
		loadTopicPackage(session.topicPackageId, session.sessionId);

		return null;
	}

	return topic.title;
}

/** The class a lesson ran for, or "guest lesson" when it ran for none */
export function lessonClassName(
	session: Pick<AgoraSession, 'classId'>,
	classes: ReadonlyArray<{ classId: string; name: string; gradeLevel?: string }>,
): string {
	if (!session.classId) return t('startGame.guest_game');

	const found = classes.find((agoraClass) => agoraClass.classId === session.classId);

	return found ? classLabel(found) : t('dashboard.class_gone');
}

/** "3 Mar 2026" in the teacher's language */
export function lessonDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(getLang(), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

/** "March 2026" — the heading a month of lessons sits under */
export function monthLabel(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(getLang(), { year: 'numeric', month: 'long' });
}
