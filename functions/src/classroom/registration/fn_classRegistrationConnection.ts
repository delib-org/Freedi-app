import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, classRegistrationOf, functionConfig } from '@freedi/shared-types';
import type {
	ClassConnectRegistrationRequest,
	ClassConnectRegistrationResponse,
	ClassDisconnectRegistrationRequest,
	ClassDisconnectRegistrationResponse,
	ClassRegistration,
	Statement,
	TableAssignment,
} from '@freedi/shared-types';
import { db } from '../../db';
import { assertWorkspaceAdmin, requireId, requireUid } from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { assertLessonNotEnded } from '../lessonStatusGuard';
import { assignmentRef, registrationSeatsQuery } from './registrationAccess';
import { planWithSide, planWithoutSide } from './registrationSteps';

/**
 * Connecting a lesson to a registration and removing the connection (IA
 * tables-class-bridge 5.3). Done in Class only. One registration, one lesson,
 * and only the Google account that hosts the registration may connect it: the
 * teacher signs in with the same account in both apps, so the uids match.
 */

function lessonRef(firestore: Firestore, mainId: string) {
	return firestore.collection(Collections.statements).doc(mainId);
}

export async function connectRegistration(
	firestore: Firestore,
	uid: string,
	req: ClassConnectRegistrationRequest,
	now: number = Date.now(),
): Promise<ClassConnectRegistrationResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const sessionId = requireId(req?.tableAssignmentId, 'tableAssignmentId');
	assertLessonNotEnded(await assertWorkspaceAdmin(firestore, mainId, uid));

	return firestore.runTransaction(async (tx) => {
		const [mainSnap, sessionSnap] = await Promise.all([
			tx.get(lessonRef(firestore, mainId)),
			tx.get(assignmentRef(firestore, sessionId)),
		]);
		const main = mainSnap.data() as Statement;
		const session = sessionSnap.data() as TableAssignment | undefined;
		if (!session) throw new ClassroomError('not-found', 'Registration not found');
		if (session.hostUid !== uid) {
			throw new ClassroomError(
				'permission-denied',
				'Only the host of the registration can connect it',
				'not-registration-host',
			);
		}
		if (session.status === 'ended') {
			throw new ClassroomError(
				'failed-precondition',
				'The registration has ended',
				'registration-ended',
			);
		}
		const current = classRegistrationOf(main);
		const elsewhere =
			(session.contextStatementId && session.contextStatementId !== mainId) ||
			(current && current.tableAssignmentId !== sessionId);
		if (elsewhere) {
			throw new ClassroomError(
				'failed-precondition',
				'One registration belongs to one lesson',
				'connected-elsewhere',
			);
		}
		if (current) return { connected: true, sideStepRemoved: current.sideStepRemoved === true };

		const plan = main.statementSettings?.lessonPlan;
		const withoutSide =
			session.settings.positionQuestion && plan ? planWithoutSide(plan) : undefined;
		const registration: ClassRegistration = {
			tableAssignmentId: sessionId,
			connectedAt: now,
			...(withoutSide ? { sideStepRemoved: true } : {}),
		};

		// ---- writes (all reads are done) ----
		tx.update(lessonRef(firestore, mainId), {
			'statementSettings.classRegistration': registration,
			...(withoutSide ? { 'statementSettings.lessonPlan': withoutSide } : {}),
			lastUpdate: now,
		});
		tx.update(sessionSnap.ref, { contextStatementId: mainId, lastUpdate: now });

		return { connected: true, sideStepRemoved: Boolean(withoutSide) };
	});
}

export async function disconnectRegistration(
	firestore: Firestore,
	uid: string,
	req: ClassDisconnectRegistrationRequest,
	now: number = Date.now(),
): Promise<ClassDisconnectRegistrationResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	await assertWorkspaceAdmin(firestore, mainId, uid);

	return firestore.runTransaction(async (tx) => {
		const main = (await tx.get(lessonRef(firestore, mainId))).data() as Statement;
		const current = classRegistrationOf(main);
		if (!current) return { disconnected: true };
		if (current.seatingCopiedAt !== undefined) {
			throw new ClassroomError(
				'failed-precondition',
				'The tables came from the registration: it stays connected',
				'seating-copied',
			);
		}
		const [sessionSnap, ledger] = await Promise.all([
			tx.get(assignmentRef(firestore, current.tableAssignmentId)),
			tx.get(registrationSeatsQuery(firestore, mainId)),
		]);
		const session = sessionSnap.data() as TableAssignment | undefined;
		const plan = main.statementSettings?.lessonPlan;

		// ---- writes (all reads are done) ----
		tx.update(lessonRef(firestore, mainId), {
			'statementSettings.classRegistration': FieldValue.delete(),
			...(current.sideStepRemoved && plan
				? { 'statementSettings.lessonPlan': planWithSide(plan) }
				: {}),
			lastUpdate: now,
		});
		if (session?.contextStatementId === mainId) {
			tx.update(sessionSnap.ref, { contextStatementId: FieldValue.delete(), lastUpdate: now });
		}
		// Arrivals before copying were links only; the people stay in the lesson as they are.
		ledger.docs.forEach((d) => tx.delete(d.ref));

		return { disconnected: true };
	});
}

export const classConnectRegistration = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassConnectRegistrationRequest>,
	): Promise<ClassConnectRegistrationResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await connectRegistration(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classConnectRegistration',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { tableAssignmentId: request.data?.tableAssignmentId },
			});
		}
	},
);

export const classDisconnectRegistration = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassDisconnectRegistrationRequest>,
	): Promise<ClassDisconnectRegistrationResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await disconnectRegistration(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classDisconnectRegistration',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
