import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraClassAggregate,
	AgoraClassGameRow,
	AgoraParticipant,
	AgoraSession,
	AgoraStudentAggregate,
	AgoraStudentGameRow,
	emptyAgoraPoints,
	emptyClassAggregate,
	emptyStudentAggregate,
	mergeClassGame,
	mergeStudentGame,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * UTC day/month/year keys, same shape as fn_adminStats' getPeriodKeys — NOT
 * imported from there because fn_adminStats pulls in the whole functions
 * index (its `db` comes from './index'), which would be a require cycle.
 */
function periodKeysFor(timestampMs: number): { day: string; month: string; year: string } {
	const date = new Date(timestampMs);
	const yyyy = date.getUTCFullYear().toString();
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(date.getUTCDate()).padStart(2, '0');

	return { day: `${yyyy}-${mm}-${dd}`, month: `${yyyy}-${mm}`, year: yyyy };
}

/**
 * Fold a finished session into the career/class aggregate docs — the numbers
 * the teacher console ("how has this student done across the term?") and the
 * sys-admin console ("how is this class advancing?") read.
 *
 * Runs in ONE transaction whose first act is re-reading the session and
 * bailing if `aggregatedAt` is already set: the trigger fires on two distinct
 * finish signals (classScore appearing at the results stage, status flipping
 * to ended) and Firestore retries triggers at-least-once, so without the
 * guard a game would count twice.
 *
 * Returns true when this call actually did the folding (the caller bumps the
 * period stats exactly then).
 */
export async function writeSessionAggregates(sessionId: string): Promise<boolean> {
	const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);

	// Participants are read before the transaction — they are final once a
	// session is finishing, and Admin-SDK transactions want reads up front.
	const participantSnaps = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();
	const students = participantSnaps.docs
		.map((doc) => doc.data() as AgoraParticipant)
		.filter((participant) => !participant.isAI);
	const rosterStudents = students.filter(
		(participant): participant is AgoraParticipant & { memberId: string } =>
			typeof participant.memberId === 'string' && participant.memberId.length > 0,
	);

	return db.runTransaction(async (transaction) => {
		const sessionSnap = await transaction.get(sessionRef);
		const session = sessionSnap.data() as AgoraSession | undefined;
		if (!session || session.aggregatedAt !== undefined) return false;

		const now = Date.now();
		const playedAt = session.classScore?.computedAt ?? now;
		const { classId, schoolId } = session;

		if (classId && schoolId) {
			const classAggRef = db.collection(Collections.agoraClassAggregates).doc(classId);
			const studentAggRefs = rosterStudents.map((student) =>
				db.collection(Collections.agoraStudentAggregates).doc(student.memberId),
			);
			const [classAggSnap, ...studentAggSnaps] = await Promise.all([
				transaction.get(classAggRef),
				...studentAggRefs.map((ref) => transaction.get(ref)),
			]);

			const classRow: AgoraClassGameRow = {
				sessionId,
				topicPackageId: session.topicPackageId,
				playedAt,
				participantCount: students.length,
				...(session.classScore ? { classScoreTotal: session.classScore.total } : {}),
				...(session.convergence?.score !== null && session.convergence?.score !== undefined
					? { convergenceScore: session.convergence.score }
					: {}),
				...(session.classScore?.outcome ? { outcome: session.classScore.outcome } : {}),
			};
			const classAgg = mergeClassGame(
				(classAggSnap.data() as AgoraClassAggregate | undefined) ??
					emptyClassAggregate(classId, schoolId),
				classRow,
				now,
			);
			transaction.set(classAggRef, classAgg);

			rosterStudents.forEach((student, index) => {
				const row: AgoraStudentGameRow = {
					sessionId,
					topicPackageId: session.topicPackageId,
					classId,
					playedAt,
					points: { ...emptyAgoraPoints(), ...student.points },
					...(session.classScore ? { classScoreTotal: session.classScore.total } : {}),
					...(session.classScore?.outcome ? { outcome: session.classScore.outcome } : {}),
				};
				const agg = mergeStudentGame(
					(studentAggSnaps[index].data() as AgoraStudentAggregate | undefined) ??
						emptyStudentAggregate(student.memberId, classId, schoolId),
					row,
					now,
				);
				transaction.set(studentAggRefs[index], agg);
			});
		}

		transaction.update(sessionRef, { aggregatedAt: now, lastUpdate: now });

		return true;
	});
}

/**
 * Bump the sys-admin dashboard's period counters (day/month/year docs in
 * `agoraStats`) for one finished session. Fire-and-forget by design — a lost
 * bump costs a KPI a tick, never a student a score.
 *
 * `classesPlayed` is unique-per-class-per-period: a marker doc is flipped once
 * inside a transaction (the questionProgressWriter technique), so a class that
 * plays five games in a month still counts once that month.
 */
export async function bumpAgoraStats(session: AgoraSession, studentCount: number): Promise<void> {
	try {
		const periodKeys = periodKeysFor(session.classScore?.computedAt ?? Date.now());
		const periods: Array<{ key: string; type: string }> = [
			{ key: periodKeys.day, type: 'day' },
			{ key: periodKeys.month, type: 'month' },
			{ key: periodKeys.year, type: 'year' },
		];
		const outcome = session.classScore?.outcome;
		const outcomeField = outcome ? `byOutcome.${outcome}` : 'byOutcome.unscored';
		const now = Date.now();
		const statsRef = db.collection(Collections.agoraStats);

		const batch = db.batch();
		for (const period of periods) {
			batch.set(
				statsRef.doc(period.key),
				{
					periodType: period.type,
					periodKey: period.key,
					gamesFinished: FieldValue.increment(1),
					[outcomeField]: FieldValue.increment(1),
					studentsReached: FieldValue.increment(studentCount),
					lastUpdate: now,
				},
				{ merge: true },
			);
		}
		await batch.commit();

		const classId = session.classId;
		if (!classId) return;

		// One transaction per period: create the marker if absent and bump the
		// unique counter in the same breath.
		for (const period of periods) {
			await db.runTransaction(async (transaction) => {
				const markerRef = statsRef.doc(`marker--${period.key}--${classId}`);
				const marker = await transaction.get(markerRef);
				if (marker.exists) return;
				transaction.set(markerRef, { classId, periodKey: period.key, createdAt: now });
				transaction.set(
					statsRef.doc(period.key),
					{ classesPlayed: FieldValue.increment(1), lastUpdate: now },
					{ merge: true },
				);
			});
		}
	} catch (error) {
		logError(error, {
			operation: 'agora.bumpAgoraStats',
			metadata: { sessionId: session.sessionId },
		});
	}
}
