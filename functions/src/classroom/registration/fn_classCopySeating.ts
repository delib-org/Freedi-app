import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	Role,
	classTableId,
	functionConfig,
	tableAssignmentTopicCountOf,
} from '@freedi/shared-types';
import type {
	ClassCopySeatingRequest,
	ClassCopySeatingResponse,
	ClassTable,
	StatementSubscription,
	TableAssignmentRosterEntry,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { db } from '../../db';
import { assertWorkspaceAdmin, requireId, requireUid, tableRef } from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { assertLessonRunning, lessonStepOf } from '../lessonStatusGuard';
import { countNoDevice } from '../noDeviceMembers';
import {
	loadConnectedLesson,
	newSeatId,
	registrationSeatRef,
	registrationSeatsQuery,
} from './registrationAccess';
import type { ConnectedLesson, RegistrationSeatDoc } from './registrationAccess';
import { planCopySeating } from './registrationSeating';

/** What copying reads from Tables: settled once published, so read outside the transaction. */
interface RegistrationTables {
	run: TableAssignmentRun;
	topicTitles: Map<string, string> | undefined;
	names: Map<string, string>;
}

async function loadRegistrationTables(
	firestore: Firestore,
	connected: ConnectedLesson,
): Promise<RegistrationTables> {
	const { session } = connected;
	if (session.status !== 'published' || !session.publishedRunId) {
		throw new ClassroomError(
			'failed-precondition',
			'The registration has no published tables yet',
			'registration-not-published',
		);
	}
	const sessionId = session.tableAssignmentId;
	const [runSnap, topicsSnap, rosterSnap] = await Promise.all([
		firestore.collection(Collections.tableAssignmentRuns).doc(session.publishedRunId).get(),
		firestore
			.collection(Collections.tableAssignmentTopics)
			.where('sessionId', '==', sessionId)
			.get(),
		firestore
			.collection(Collections.tableAssignmentRoster)
			.where('sessionId', '==', sessionId)
			.get(),
	]);
	const run = runSnap.data() as TableAssignmentRun | undefined;
	if (!run) {
		throw new ClassroomError(
			'failed-precondition',
			'The registration has no published tables yet',
			'registration-not-published',
		);
	}
	const oneTopic = tableAssignmentTopicCountOf(session.settings) === 'one';
	const topicTitles = oneTopic
		? undefined
		: new Map(
				topicsSnap.docs.map((d) => {
					const topic = d.data() as TableAssignmentTopic;

					return [topic.topicId, topic.title] as const;
				}),
			);
	const names = new Map(
		rosterSnap.docs.map((d) => {
			const entry = d.data() as TableAssignmentRosterEntry;

			return [entry.uid, entry.fullName] as const;
		}),
	);

	return { run, topicTitles, names };
}

/**
 * `classCopySeating` (admin): "הבאת השולחנות מההרשמה", at the Tables step
 * only (IA tables-class-bridge 5.3). The published tables become the lesson's
 * tables, same numbers and topics. From then on the lesson owns the seating;
 * "עדכון מההרשמה" (`replace: true`) copies again and undoes moves by hand.
 * One transaction: old tables, every member's tableId and the ledger change
 * together.
 */
export async function copySeating(
	firestore: Firestore,
	uid: string,
	req: ClassCopySeatingRequest,
	now: number = Date.now(),
): Promise<ClassCopySeatingResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const main = await assertWorkspaceAdmin(firestore, mainId, uid);
	assertLessonRunning(main);
	const connected = await loadConnectedLesson(firestore, mainId);
	if (lessonStepOf(connected.main) !== 'tables') {
		throw new ClassroomError(
			'failed-precondition',
			'The tables are brought at the Tables step',
			'not-tables-step',
		);
	}
	if (connected.registration.seatingCopiedAt !== undefined && req?.replace !== true) {
		throw new ClassroomError(
			'already-exists',
			'The tables were brought already; pass replace: true to bring them again',
			'seating-copied',
		);
	}
	const { run, topicTitles, names } = await loadRegistrationTables(firestore, connected);
	const seatsPerTable = connected.session.settings.tableSize;

	const subsQuery = firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId)
		.where('role', '==', Role.member);
	const tablesQuery = firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId);

	return firestore.runTransaction(async (tx) => {
		const [subsSnap, oldTablesSnap, ledgerSnap] = await Promise.all([
			tx.get(subsQuery),
			tx.get(tablesQuery),
			tx.get(registrationSeatsQuery(firestore, mainId)),
		]);
		const subs = subsSnap.docs.map((d) => d.data() as StatementSubscription);
		const memberUids = new Set(subs.map((s) => s.userId));
		// A device that left the lesson (or was banned) no longer holds its registration's seat.
		const ledger = ledgerSnap.docs.map((d) => {
			const doc = { ...(d.data() as RegistrationSeatDoc) };
			if (doc.classUid && !memberUids.has(doc.classUid)) delete doc.classUid;

			return doc;
		});
		const linked = new Set(ledger.flatMap((doc) => (doc.classUid ? [doc.classUid] : [])));
		// A device whose seat moved elsewhere is not a walk-in: it waits at "the seat moved".
		const walkInUids = subs
			.filter((s) => !linked.has(s.userId) && s.seatMovedAt === undefined)
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
			.map((s) => s.userId);
		const oldTables = oldTablesSnap.docs.map((d) => d.data() as ClassTable);
		const plan = planCopySeating({
			mainId,
			sessionId: connected.session.tableAssignmentId,
			now,
			runTables: run.tables,
			topicTitles,
			names,
			ledger,
			walkInUids,
			oldTables,
			seatsPerTable,
			newSeatId,
		});

		// ---- writes (all reads are done) ----
		const newIds = new Set(plan.tables.map((t) => t.tableId));
		oldTablesSnap.docs.forEach((d) => {
			if (!newIds.has(d.id)) tx.delete(d.ref);
		});
		plan.tables.forEach((table) => tx.set(tableRef(firestore, table.tableId), table));
		plan.ledger.forEach((doc) =>
			tx.set(registrationSeatRef(firestore, mainId, doc.registrationUid), doc),
		);
		subsSnap.docs.forEach((d) => {
			const sub = d.data() as StatementSubscription;
			const n = plan.seatOf.get(sub.userId);
			if (n !== undefined) {
				tx.update(d.ref, { tableId: classTableId(mainId, n), lastUpdate: now });
			} else if (sub.tableId) {
				tx.update(d.ref, { tableId: FieldValue.delete(), lastUpdate: now });
			}
		});
		tx.update(firestore.collection(Collections.statements).doc(mainId), {
			'statementSettings.classRegistration.seatingCopiedAt': now,
			'statementSettings.classRegistration.seatsPerTable': seatsPerTable,
			'statementSettings.noDeviceCount': countNoDevice(plan.tables),
			lastUpdate: now,
		});

		return {
			tables: plan.tables.length,
			arrived: plan.arrived,
			reserved: plan.reserved,
			walkInsSeated: plan.walkInsSeated,
			withoutTable: plan.withoutTable,
		};
	});
}

export const classCopySeating = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (request: CallableRequest<ClassCopySeatingRequest>): Promise<ClassCopySeatingResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await copySeating(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCopySeating',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { replace: request.data?.replace },
			});
		}
	},
);
