import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraClass,
	AgoraClassAggregate,
	AgoraClassGameRow,
	AgoraParticipant,
	AgoraSession,
	AgoraStudentAggregate,
	AgoraStudentGameRow,
	AgoraTeacherAggregate,
	AgoraThemeTally,
	emptyAgoraPoints,
	emptyClassAggregate,
	emptyStudentAggregate,
	emptyTeacherAggregate,
	mergeClassGame,
	mergeStudentGame,
	mergeTeacherLesson,
	tallyAgoraThemes,
	teacherLessonRowFrom,
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
 * Fold one finished lesson into the teacher's own aggregate doc, inside a
 * transaction the caller already opened (and already READ `prevAgg` in — Admin
 * transactions want every read before the first write). Shared by the
 * finished-session fold below and the backfill, so the two can never build
 * the row differently. Returns the merged doc.
 */
export function foldTeacherLessonTx(
	transaction: Transaction,
	session: AgoraSession,
	studentCount: number,
	prevAgg: AgoraTeacherAggregate | undefined,
	now: number,
): AgoraTeacherAggregate {
	const teacherAggRef = db.collection(Collections.agoraTeacherAggregates).doc(session.teacherId);
	const row = teacherLessonRowFrom(session, studentCount);
	const agg = mergeTeacherLesson(prevAgg ?? emptyTeacherAggregate(session.teacherId), row, now);
	transaction.set(teacherAggRef, agg);

	return agg;
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
 * Returns the room's theme tally when this call actually did the folding (the caller bumps the
 * period stats exactly then).
 */
export async function writeSessionAggregates(sessionId: string): Promise<AgoraThemeTally | null> {
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
		if (!session || session.aggregatedAt !== undefined) return null;

		const now = Date.now();
		const playedAt = session.classScore?.computedAt ?? now;
		const { classId, schoolId } = session;

		// Every read up front — the teacher's doc beside the class and career
		// docs — because the first write closes the transaction to reads. The
		// class comes along for its teacherMap: the aggregate carries a copy so
		// a teacher's browser can query its own classes' advancement without
		// the rule reading this document for every one of them.
		const teacherAggRef = db.collection(Collections.agoraTeacherAggregates).doc(session.teacherId);
		const classAggRef =
			classId && schoolId ? db.collection(Collections.agoraClassAggregates).doc(classId) : null;
		const classRef =
			classId && schoolId ? db.collection(Collections.agoraClasses).doc(classId) : null;
		const studentAggRefs =
			classId && schoolId
				? rosterStudents.map((student) =>
						db.collection(Collections.agoraStudentAggregates).doc(student.memberId),
					)
				: [];
		const [teacherAggSnap, classAggSnap, classSnap, studentAggSnaps] = await Promise.all([
			transaction.get(teacherAggRef),
			classAggRef ? transaction.get(classAggRef) : Promise.resolve(null),
			classRef ? transaction.get(classRef) : Promise.resolve(null),
			Promise.all(studentAggRefs.map((ref) => transaction.get(ref))),
		]);
		const teacherMap = (classSnap?.data() as AgoraClass | undefined)?.teacherMap;

		if (classId && schoolId && classAggRef && classAggSnap) {
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
					emptyClassAggregate(classId, schoolId, teacherMap),
				classRow,
				now,
			);
			transaction.set(classAggRef, {
				...classAgg,
				...(teacherMap ? { teacherMap } : {}),
			});

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

		// The teacher's own doc advances for EVERY finished game, guest games
		// included — a lesson without a roster is still a lesson.
		if (session.teacherAggregatedAt === undefined) {
			foldTeacherLessonTx(
				transaction,
				session,
				students.length,
				teacherAggSnap.data() as AgoraTeacherAggregate | undefined,
				now,
			);
		}

		transaction.update(sessionRef, {
			aggregatedAt: now,
			teacherAggregatedAt: now,
			lastUpdate: now,
		});

		// How the room dressed, counted from the same participant reads — the
		// one thing the company asked to learn from a finished game that is
		// not a score
		return tallyAgoraThemes(session, students);
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
export async function bumpAgoraStats(
	session: AgoraSession,
	studentCount: number,
	themes: AgoraThemeTally,
): Promise<void> {
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
					// Which look people actually played in — the favourite-design
					// question, answered per student rather than per room
					'byTheme.candy': FieldValue.increment(themes.worn.candy),
					'byTheme.purple': FieldValue.increment(themes.worn.purple),
					'byTheme.custom': FieldValue.increment(themes.worn.custom),
					'byTheme.built': FieldValue.increment(themes.built),
					'byTheme.borrowed': FieldValue.increment(themes.borrowed),
					[`byRoomTheme.${themes.sessionDefault}`]: FieldValue.increment(1),
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
