import m from 'mithril';
import { Collections } from '@freedi/shared-types';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { collection, db, query, where } from '@/lib/firebase';
import type { Unsubscribe } from '@/lib/firebase';
import { t } from '@/lib/i18n';
import { resilientOnSnapshot } from '@/lib/resilientListeners';
import { classState } from '@/lib/classroom/classState';
import { rosterStudents } from '@/lib/classroom/consoleHelpers';
import {
	minRatingsPerProposal,
	ratedAllLine,
	ratingsByStudent,
	tableRatedLine,
	type RatingsByStudent,
} from '@/lib/classroom/allProposalsConsole';
import { consoleState } from './consoleState';

/**
 * The teacher console's one ratings listener at "כל ההצעות" (IA 19.6): every
 * evaluation on the challenge question's options (about 34 x 34 docs at most),
 * kept as student -> rated proposal ids. Teacher only, and only at that step.
 */

const LISTENER = 'consoleAllProposalsRatings';

let stop: Unsubscribe | null = null;
let watchedFor: string | null = null;
let current: RatingsByStudent = new Map();

/** Keep the listener on `challengeId`'s evaluations; null stops it. */
export function watchAllProposalsRatings(challengeId: string | null): void {
	if (challengeId === watchedFor) return;
	stopAllProposalsRatings();
	if (!challengeId) return;
	watchedFor = challengeId;
	stop = resilientOnSnapshot(
		LISTENER,
		query(collection(db, Collections.evaluations), where('parentId', '==', challengeId)),
		(snap) => {
			const docs = snap.docs
				.map((d) => d.data() as { evaluatorId?: unknown; statementId?: unknown })
				.filter(
					(d): d is { evaluatorId: string; statementId: string } =>
						typeof d.evaluatorId === 'string' && typeof d.statementId === 'string',
				);
			current = ratingsByStudent(docs);
			m.redraw();
		},
		(error) =>
			console.error(
				'[TeacherConsole] ratings listener error',
				{ operation: 'allProposals.watchRatings', challengeId },
				error,
			),
	);
}

export function stopAllProposalsRatings(): void {
	stop?.();
	stop = null;
	watchedFor = null;
	current = new Map();
}

function proposalsOf(challenge: Statement | null): Statement[] {
	return challenge ? (consoleState.options.get(challenge.statementId) ?? []) : [];
}

/** The band's "n of m students rated everything · every proposal has at least k ratings". */
export function allRatedBandLine(challenge: Statement | null): string {
	const options = proposalsOf(challenge);
	const uids = rosterStudents(classState.roster).map((s) => s.uid);
	const line = ratedAllLine(uids, options, challenge?.statementId ?? null, current);

	return t('console.all_rated_line', { n: line.n, m: line.m, k: minRatingsPerProposal(options) });
}

/** A table card's "n/m rated everything". */
export function tableRatedText(table: ClassTable, challenge: Statement | null): string {
	const line = tableRatedLine(
		table,
		proposalsOf(challenge),
		challenge?.statementId ?? null,
		current,
	);

	return t('console.table_rated_all', { n: line.n, m: line.m });
}
