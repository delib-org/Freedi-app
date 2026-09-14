import { randomUUID } from 'crypto';
import { getFirestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
	CovenantAction,
	CovenantRecord,
	CovenantResponse,
	CovenantMember,
	emptyCovenant,
} from '../../../packages/shared-types/src/models/covenant/covenant';
import { applyCovenantAction, CovenantFailure } from './reducer';

const memberRoles = ['admin', 'statement-creator', 'member'];
const adminRoles = ['admin', 'statement-creator'];
function validId(value: unknown): value is string {
	return (
		typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/')
	);
}
export async function covenantService(uid: string, input: unknown): Promise<CovenantResponse> {
	if (!input || typeof input !== 'object')
		throw new HttpsError('invalid-argument', 'Invalid request.');
	const data = input as {
		questionId?: unknown;
		action?: CovenantAction;
		expectedRevision?: unknown;
	};
	if (!validId(data.questionId)) throw new HttpsError('invalid-argument', 'Invalid question.');
	const questionId = data.questionId;
	const db = getFirestore();

	const execute = async (tx: Pick<Transaction, 'get' | 'set'>): Promise<CovenantResponse> => {
		const qRef = db.collection('statements').doc(questionId);
		const qSnap = await tx.get(qRef);
		const q = qSnap.data();
		if (!q || q.statementType !== 'question' || q.hide)
			throw new HttpsError('not-found', 'Question is unavailable.');
		const scopeId = q.membership?.access
			? questionId
			: validId(q.topParentId)
				? q.topParentId
				: questionId;
		const scope =
			scopeId === questionId ? q : (await tx.get(db.collection('statements').doc(scopeId))).data();
		const ownSub = (
			await tx.get(db.collection('statementsSubscribe').doc(`${uid}--${questionId}`))
		).data();
		const scopeSub =
			scopeId === questionId
				? ownSub
				: (await tx.get(db.collection('statementsSubscribe').doc(`${uid}--${scopeId}`))).data();
		const creator = q.creatorId === uid || q.creator?.uid === uid;
		const scopeCreator = scope?.creatorId === uid || scope?.creator?.uid === uid;
		if (
			['banned', 'waiting'].includes(ownSub?.role) ||
			scopeSub?.role === 'banned' ||
			(!creator &&
				!scopeCreator &&
				!memberRoles.includes(ownSub?.role) &&
				!memberRoles.includes(scopeSub?.role))
		)
			throw new HttpsError('permission-denied', 'Active question membership is required.');
		const manager =
			creator ||
			scopeCreator ||
			adminRoles.includes(ownSub?.role) ||
			adminRoles.includes(scopeSub?.role);
		const recordRef = db.collection('covenantWorkflows').doc(questionId);
		const snapshot = await tx.get(recordRef);
		const stored = snapshot.data();
		const reviewSnapshots = await tx.get(
			recordRef.collection('reviews').orderBy('version', 'desc').limit(1),
		);
		const current: CovenantRecord = stored
			? ({ ...stored, reviews: reviewSnapshots.docs.map((doc) => doc.data()) } as CovenantRecord)
			: emptyCovenant(questionId, String(q.statement));

		if (!data.action) return { record: current, members: [], canManage: manager };
		const members: CovenantMember[] = [];
		if (data.action.type === 'open-review') {
			// A roster is explicitly chosen at review time; subscriptions are never treated as consent.
			const subs = await tx.get(
				db.collection('statementsSubscribe').where('statementId', '==', scopeId),
			);
			const direct =
				scopeId === questionId
					? subs
					: await tx.get(
							db.collection('statementsSubscribe').where('statementId', '==', questionId),
						);
			const banned = new Set(
				[...subs.docs, ...direct.docs]
					.filter((d) => d.data().role === 'banned')
					.map((d) => d.data().userId),
			);
			for (const doc of [...subs.docs, ...direct.docs]) {
				const sub = doc.data();
				if (
					validId(sub.userId) &&
					memberRoles.includes(sub.role) &&
					!banned.has(sub.userId) &&
					!members.some((m) => m.uid === sub.userId)
				)
					members.push({
						uid: sub.userId,
						name: String(
							sub.user?.displayName || sub.creator?.displayName || sub.displayName || sub.userId,
						).slice(0, 100),
					});
			}
			for (const item of [q, scope]) {
				const id = item?.creatorId || item?.creator?.uid;
				if (validId(id) && !banned.has(id) && !members.some((m) => m.uid === id))
					members.push({ uid: id, name: String(item?.creator?.displayName || id).slice(0, 100) });
			}
		}
		if (!Number.isInteger(data.expectedRevision) || data.expectedRevision !== current.revision)
			throw new HttpsError('aborted', 'The document changed. Refresh it and try again.');
		let settings = q.questionSettings || {};
		if (!settings.deadline && Array.isArray(q.parents)) {
			for (const parentId of [...q.parents].reverse()) {
				if (!validId(parentId) || parentId === questionId) continue;
				const parent = (await tx.get(db.collection('statements').doc(parentId))).data();
				if (parent?.questionSettings?.deadline) {
					settings = {
						...parent.questionSettings,
						isHalted: settings.isHalted || parent.questionSettings.isHalted,
					};
					break;
				}
			}
		}
		if (
			settings.isHalted ||
			settings.pausedAt ||
			(settings.deadline && settings.deadline <= Date.now())
		)
			throw new HttpsError(
				'failed-precondition',
				'The question’s decision process is paused or closed.',
			);
		let source;
		if (data.action.type === 'add-clause') {
			if (!validId(data.action.sourceId))
				throw new HttpsError('invalid-argument', 'Invalid solution.');
			const s = (await tx.get(db.collection('statements').doc(data.action.sourceId))).data();
			if (!s || s.parentId !== questionId || s.statementType !== 'option' || s.hide)
				throw new HttpsError(
					'failed-precondition',
					'Choose an available solution from this question.',
				);
			source = {
				id: randomUUID(),
				text: String(s.statement),
				sourceText: String(s.statement),
				sourceId: data.action.sourceId,
			};
		}
		let next: CovenantRecord;
		try {
			next = applyCovenantAction(current, data.action, {
				uid,
				manager,
				now: Date.now(),
				id: randomUUID(),
				source,
				eligibleIds: members.map((m) => m.uid),
			});
		} catch (error) {
			if (error instanceof CovenantFailure) throw new HttpsError(error.code, error.message);
			throw new HttpsError('invalid-argument', 'Invalid covenant action.');
		}
		const { reviews, ...record } = next;
		if (Buffer.byteLength(JSON.stringify(record)) > 700000)
			throw new HttpsError(
				'resource-exhausted',
				'The document is too large. Export it before starting a new discussion.',
			);
		tx.set(recordRef, record);
		const latest = reviews[reviews.length - 1];
		if (latest) {
			if (Buffer.byteLength(JSON.stringify(latest)) > 700000)
				throw new HttpsError('resource-exhausted', 'The review is too large.');
			tx.set(recordRef.collection('reviews').doc(String(latest.version)), latest);
		}

		return { record: next, members: manager ? members : [], canManage: manager };
	};
	if (data.action) return db.runTransaction(execute);

	return execute({
		get: ((ref: { get: () => Promise<unknown> }) => ref.get()) as Transaction['get'],
		set: (() => {
			throw new Error('Read-only status cannot write.');
		}) as Transaction['set'],
	});
}
