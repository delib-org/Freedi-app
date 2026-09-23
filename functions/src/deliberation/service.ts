import { DELIBERATION_LIMITS } from '../../../packages/shared-types/src/models/covenant/deliberation';
import { Collections, StatementType } from '@freedi/shared-types';
import { randomUUID } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
	AgreementChange,
	DeliberationStatus,
} from '../../../packages/shared-types/src/models/covenant/deliberation';
import { db } from '../db';
import { assertRegisteredFacilitator } from './policy';

import { generate } from './generation';
import {
	AgreementStatement,
	creatorFor,
	assertProcessOpen,
	identifier,
	persistAgreement,
	questionFor,
	required,
	sha,
	snapshot,
	statements,
	status,
	workflows,
} from './records';

export { generate } from './generation';
export {
	AGREEMENT_MODEL,
	assertProcessOpen,
	automaticReady,
	questionFor,
	selectedSources,
	sourcesHash,
} from './records';
export async function act(
	uid: string,
	input: Record<string, unknown>,
): Promise<DeliberationStatus> {
	const questionId = identifier(input.questionId),
		{ question, canManage } = await questionFor(uid, questionId);
	const action = String(input.action || 'status');
	if (action === 'status') return status(uid, questionId);
	const memberActions = ['rate', 'propose'];
	if (!memberActions.includes(action) && !canManage)
		throw new HttpsError('permission-denied', 'Only the facilitator can perform this action.');
	await assertProcessOpen(question);
	const ref = workflows.doc(questionId);
	if (action === 'enable') {
		await assertRegisteredFacilitator(uid);
		await ref.set(
			{
				enabled: input.enabled === true,
				enabledBy: uid,
				attempts: 0,
				dirty: input.enabled === true,
				queuedAt: Date.now(),
				lastCheckedAt: 0,
			},
			{ merge: true },
		);
	} else if (action === 'summary' || action === 'agreement') {
		await assertRegisteredFacilitator(uid);
		await generate(question, action, false, uid);
	} else if (action === 'rate' || action === 'propose' || action === 'fork') {
		const id = identifier(input.documentId),
			document = (await statements.doc(id).get()).data() as AgreementStatement;
		if (
			!document ||
			document.parentId !== questionId ||
			String(document.statementType) !== 'agreement'
		)
			throw new HttpsError('not-found', 'Agreement unavailable.');
		const current = await snapshot(document);
		if (input.hash !== current.hash)
			throw new HttpsError('aborted', 'The document changed. Refresh before continuing.');
		if (action === 'rate') {
			if (typeof input.value !== 'number' || ![-1, 0, 1].includes(input.value))
				throw new HttpsError('invalid-argument', 'Choose support, neutral or oppose.');
			await ref
				.collection('wordings')
				.doc(current.hash)
				.set({ documentId: id, title: current.title, paragraphs: current.paragraphs });
			await ref.collection('ratings').doc(`${id}--${current.hash}--${uid}`).set({
				documentId: id,
				userId: uid,
				hash: current.hash,
				value: input.value,
				at: Date.now(),
			});
		} else if (action === 'propose') {
			if (
				!Array.isArray(input.changes) ||
				!input.changes.length ||
				input.changes.length > DELIBERATION_LIMITS.changesPerRequest
			)
				throw new HttpsError('invalid-argument', 'Propose between 1 and 30 changes.');
			const changes = input.changes.map((value: unknown) => {
				if (!value || typeof value !== 'object')
					throw new HttpsError('invalid-argument', 'Invalid change.');
				const c = value as Record<string, unknown>;
				const paragraphId = identifier(c.paragraphId);
				if (!current.paragraphs.some((p) => p.id === paragraphId))
					throw new HttpsError('invalid-argument', 'Unknown paragraph.');

				return { paragraphId, text: required(c.text, DELIBERATION_LIMITS.paragraphCharacters) };
			});
			await ref.collection('changes').add({
				documentId: id,
				baseHash: current.hash,
				authorId: uid,
				issue: required(input.issue),
				changes,
				status: 'open',
				createdAt: Date.now(),
			});
		} else {
			const requestId = identifier(input.requestId),
				changeRef = ref.collection('changes').doc(requestId),
				change = (await changeRef.get()).data() as AgreementChange;
			if (
				!change ||
				change.documentId !== id ||
				change.baseHash !== current.hash ||
				change.status !== 'open'
			)
				throw new HttpsError(
					'failed-precondition',
					'This suggestion must be refreshed before it can be applied.',
				);
			if (!['version', 'alternative'].includes(String(input.kind)))
				throw new HttpsError('invalid-argument', 'Choose version or alternative.');
			const resultId = sha({ questionId, requestId });
			const parts = current.paragraphs.map((p) => ({
				text: change.changes.find((c) => c.paragraphId === p.id)?.text ?? p.text,
				type: p.type,
			}));
			if (!(await statements.doc(resultId).get()).exists)
				await persistAgreement(
					question,
					required(input.title, DELIBERATION_LIMITS.titleCharacters),
					parts,
					{
						...document.agreementMeta!,
						familyId: input.kind === 'version' ? current.familyId : resultId,
						previousId: id,
						kind: input.kind as 'version' | 'alternative',
						introduction: parts.find((p) => p.type === 'paragraph')?.text || current.introduction,
					},
					resultId,
				);
			await changeRef.update({ status: 'applied', resultId });
		}
	} else if (action === 'finalizeVote') {
		const ballotId = identifier(input.ballotId),
			ballotRef = statements.doc(ballotId);
		await db.runTransaction(async (tx) => {
			const ballot = (await tx.get(ballotRef)).data() as AgreementStatement | undefined;
			const workflow = (await tx.get(ref)).data();
			if (
				!ballot ||
				ballot.parentId !== questionId ||
				!ballot.agreementBallot ||
				ballot.statementType !== StatementType.question
			)
				throw new HttpsError('invalid-argument', 'Choose a ballot from this question.');
			if (workflow?.ballotResults?.[ballotId]) return;
			const options = (await tx.get(statements.where('parentId', '==', ballotId))).docs.map(
				(d) => d.data() as AgreementStatement,
				creatorFor,
			);
			const votes = (
				await tx.get(db.collection(Collections.votes).where('parentId', '==', ballotId))
			).docs;
			const counts = options
				.filter((o) => o.agreementBallot)
				.map((o) => ({
					option: o,
					count: votes.filter(
						(v) =>
							v.id === `${v.data().userId}--${ballotId}` && v.data().statementId === o.statementId,
					).length,
				}))
				.sort((a, b) => b.count - a.count);
			if (!counts[0]?.count || counts[0].count === counts[1]?.count)
				throw new HttpsError(
					'failed-precondition',
					'There is no unique winner. Continue deliberation or voting.',
				);
			const winner = counts[0].option;
			const result = {
				documentId: winner.agreementBallot!.documentIds[0],
				hash: winner.agreementBallot!.hashes[0],
				title: winner.statement,
				at: Date.now(),
				votes: counts[0].count,
			};
			tx.set(ref, { ballotResults: { [ballotId]: result } }, { merge: true });
			tx.update(ballotRef, {
				'questionSettings.isHalted': true,
				'statementSettings.inVotingGetOnlyResults': true,
			});
		});
	} else if (action === 'vote') {
		if (
			!Array.isArray(input.documentIds) ||
			input.documentIds.length < 2 ||
			input.documentIds.length > DELIBERATION_LIMITS.ballotAlternatives
		)
			throw new HttpsError('invalid-argument', 'Choose 2–12 alternatives.');
		const ids = [...new Set(input.documentIds.map(identifier))];
		if (ids.length !== input.documentIds.length)
			throw new HttpsError('invalid-argument', 'Choose unique alternatives.');
		const candidates = await Promise.all(
			ids.map(async (id) => {
				const doc = (await statements.doc(id).get()).data() as AgreementStatement;
				if (!doc || doc.parentId !== questionId || String(doc.statementType) !== 'agreement')
					throw new HttpsError('invalid-argument', 'Choose agreements from this question.');

				return snapshot(doc);
			}),
		);
		const ballotId = sha(candidates.map((c) => ({ id: c.id, hash: c.hash }))),
			creator = await creatorFor(question),
			now = Date.now();
		if (!(await statements.doc(ballotId).get()).exists) {
			const ballot = {
				statementId: ballotId,
				statement: required(input.title, DELIBERATION_LIMITS.titleCharacters),
				statementType: 'question',
				parentId: questionId,
				topParentId: question.topParentId,
				parents: [...(question.parents || []), questionId],
				creatorId: creator.uid,
				creator,
				membership: question.membership,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				statementSettings: {
					showEvaluation: true,
					enableAddVotingOption: false,
					inVotingGetOnlyResults: false,
				},
				questionSettings: { questionType: 'simple', currentStep: 'voting' },
				evaluationSettings: { evaluationUI: 'voting' },
				agreementBallot: { questionId, documentIds: ids, hashes: candidates.map((c) => c.hash) },
			};
			const batch = db.batch();
			batch.create(statements.doc(ballotId), ballot);
			for (const c of candidates) {
				const id = randomUUID();
				batch.create(statements.doc(id), {
					statementId: id,
					statement: c.title,
					statementType: 'option',
					parentId: ballotId,
					topParentId: question.topParentId,
					parents: [...(question.parents || []), questionId, ballotId],
					creatorId: creator.uid,
					creator,
					createdAt: now,
					lastUpdate: now,
					consensus: 0,
					description: c.paragraphs.map((p) => p.text).join('\n\n'),
					agreementBallot: { questionId, documentIds: [c.id], hashes: [c.hash] },
				});
			}
			await batch.commit();
		}
	} else throw new HttpsError('invalid-argument', 'Unknown action.');

	return status(uid, questionId);
}
