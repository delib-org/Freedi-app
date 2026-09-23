import { DELIBERATION_LIMITS } from '../../../packages/shared-types/src/models/covenant/deliberation';
import {
	Collections,
	ParagraphType,
	SourceApp,
	Statement,
	StatementType,
	User,
	calcAgreement,
	createParagraphChildStatement,
} from '@freedi/shared-types';
import { createHash } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
	AgreementChange,
	AgreementLink,
	AgreementSnapshot,
	DeliberationStatus,
} from '../../../packages/shared-types/src/models/covenant/deliberation';
import { TAXONOMY_MODEL } from '../config/openai-chat';
import { db } from '../db';
import { assertStatementAdmin } from '../progress/assertStatementAdmin';

export type AgreementStatement = Statement & {
	agreementMeta?: AgreementLink;
	deliberationEnabled?: boolean;
	agreementBallot?: { questionId: string; documentIds: string[]; hashes: string[] };
};
export const AGREEMENT_MODEL = process.env.OPENAI_AGREEMENT_MODEL || TAXONOMY_MODEL;
export const statements = db.collection(Collections.statements);
export const workflows = db.collection('questionDeliberations');
export const sha = (data: unknown): string =>
	createHash('sha256').update(JSON.stringify(data)).digest('hex');
export function required(
	value: unknown,
	max: number = DELIBERATION_LIMITS.issueCharacters,
): string {
	if (typeof value !== 'string' || !value.trim() || value.length > max)
		throw new HttpsError('invalid-argument', 'Invalid text.');

	return value.trim();
}
export function identifier(value: unknown): string {
	const id = required(value, DELIBERATION_LIMITS.idCharacters);
	if (id.includes('/')) throw new HttpsError('invalid-argument', 'Invalid identifier.');

	return id;
}
export async function questionFor(
	uid: string,
	id: string,
): Promise<{ question: AgreementStatement; canManage: boolean }> {
	const question = (await statements.doc(id).get()).data() as AgreementStatement | undefined;
	if (!question || question.statementType !== StatementType.question || question.hide)
		throw new HttpsError('not-found', 'Question unavailable.');
	const scopes = [...new Set([id, question.topParentId].filter(Boolean))];
	const subs = await Promise.all(
		scopes.map((scope) =>
			db.collection(Collections.statementsSubscribe).doc(`${uid}--${scope}`).get(),
		),
	);
	if (subs.some((s) => ['banned', 'waiting'].includes(s.data()?.role)))
		throw new HttpsError('permission-denied', 'Membership is blocked.');
	let canManage =
		question.creatorId === uid ||
		subs.some((s) => ['admin', 'statement-creator'].includes(s.data()?.role));
	const top =
		question.topParentId && question.topParentId !== id && question.topParentId !== 'top'
			? (await statements.doc(question.topParentId).get()).data()
			: undefined;
	if (!canManage && (question.organizationId || top?.organizationId))
		try {
			await assertStatementAdmin(uid, question, 'deliberation');
			canManage = true;
		} catch (e) {
			if (!(e instanceof HttpsError) || e.code !== 'permission-denied') throw e;
		}
	if (
		!canManage &&
		!subs.some((s) => ['member', 'admin', 'statement-creator'].includes(s.data()?.role))
	)
		throw new HttpsError('permission-denied', 'Join the question before participating.');

	return { question, canManage };
}
export async function assertProcessOpen(question: Statement): Promise<void> {
	const ancestors = await Promise.all(
		[...new Set(question.parents || [])]
			.filter((id) => id !== 'top' && id !== question.statementId)
			.map((id) => statements.doc(id).get()),
	);
	for (const item of [question, ...ancestors.map((s) => s.data())]) {
		const settings = item?.questionSettings;
		if (
			item?.hide ||
			settings?.isHalted ||
			settings?.pausedAt ||
			(settings?.deadline && settings.deadline <= Date.now())
		)
			throw new HttpsError('failed-precondition', 'The decision process is paused or closed.');
	}
}
export async function children(id: string): Promise<AgreementStatement[]> {
	return (await statements.where('parentId', '==', id).get()).docs
		.map((d) => d.data() as AgreementStatement)
		.filter((s) => !s.hide);
}
export function selectedSources(items: AgreementStatement[]): AgreementStatement[] {
	return items
		.filter(
			(s) =>
				['option', 'synthesis'].includes(s.statementType) &&
				s.isChosen === true &&
				!s.hide &&
				!s.integratedInto,
		)
		.sort((a, b) => a.statementId.localeCompare(b.statementId));
}
export function sourcesHash(sources: AgreementStatement[]): string {
	return sha(
		sources.map((s) => ({ id: s.statementId, text: s.statement, paragraphs: s.paragraphs || [] })),
	);
}
export function automaticReady(sources: AgreementStatement[]): boolean {
	return (
		sources.length > 0 &&
		sources.every(
			(s) =>
				(s.evaluation?.numberOfEvaluators || 0) > 0 &&
				Number.isFinite(s.consensus) &&
				s.consensus >= DELIBERATION_LIMITS.agreementCp,
		)
	);
}
export async function snapshot(
	document: AgreementStatement,
	uid?: string,
): Promise<AgreementSnapshot> {
	const paragraphs = (await children(document.statementId))
		.filter(
			(p) => p.statementType === StatementType.paragraph && p.doc?.isOfficialParagraph !== false,
		)
		.sort((a, b) => (a.order || 0) - (b.order || 0) || a.statementId.localeCompare(b.statementId))
		.map((p) => ({
			id: p.statementId,
			text: p.statement,
			type: String(p.doc?.paragraphType || p.blockType || 'paragraph'),
		}));
	const hash = sha({ title: document.statement, paragraphs });
	const evaluations = (
		await workflows
			.doc(document.parentId)
			.collection('ratings')
			.where('documentId', '==', document.statementId)
			.get()
	).docs
		.map((d) => d.data())
		.filter((r) => r.hash === hash && typeof r.value === 'number' && r.value >= -1 && r.value <= 1);
	const n = evaluations.length;
	const cp = calcAgreement(
		evaluations.reduce((sum, r) => sum + r.value, 0),
		evaluations.reduce((sum, r) => sum + r.value * r.value, 0),
		n,
	);
	const meta = document.agreementMeta;

	return {
		id: document.statementId,
		title: document.statement,
		hash,
		paragraphs,
		introduction: (
			paragraphs.find((p) => p.type === 'paragraph')?.text ||
			meta?.introduction ||
			''
		).replace(/<[^>]*>/g, ''),
		familyId: meta?.familyId || document.statementId,
		kind: meta?.kind || 'initial',
		...(meta?.previousId ? { previousId: meta.previousId } : {}),
		cp,
		evaluators: n,
		myRating: evaluations.find((r) => r.userId === uid)?.value ?? null,
		agreed: n > 0 && cp >= DELIBERATION_LIMITS.agreementCp,
	};
}
export async function status(uid: string, questionId: string): Promise<DeliberationStatus> {
	const { canManage } = await questionFor(uid, questionId);
	const items = await children(questionId),
		sources = selectedSources(items),
		hash = sourcesHash(sources);
	const state = (await workflows.doc(questionId).get()).data();
	const changes = (await workflows.doc(questionId).collection('changes').get()).docs.map(
		(d) => ({ id: d.id, ...d.data() }) as AgreementChange,
	);

	return {
		questionId,
		canManage,
		sources: sources.map((s) => ({ id: s.statementId, text: s.statement, cp: s.consensus })),
		sourceHash: hash,
		summary: state?.summary || '',
		summaryAt: state?.summaryAt || 0,
		summaryStale: state?.summaryHash !== hash,
		automatic: state?.enabled === true && typeof state.enabledBy === 'string',
		agreements: await Promise.all(
			items.filter((s) => String(s.statementType) === 'agreement').map((s) => snapshot(s, uid)),
		),
		changes,
		ballots: items
			.filter((s) => s.agreementBallot)
			.map((s) => ({
				id: s.statementId,
				title: s.statement,
				result: (state?.ballotResults || {})[s.statementId] || null,
			})),
	};
}
export async function creatorFor(question: Statement): Promise<User> {
	const user = (await db.collection(Collections.users).doc(question.creatorId).get()).data();

	return {
		...(question.creator || {}),
		...user,
		uid: question.creatorId,
		displayName: String(user?.displayName || question.creator?.displayName || 'Facilitator'),
	} as User;
}
export async function persistAgreement(
	question: AgreementStatement,
	title: string,
	parts: Array<{ text: string; type: string }>,
	meta: AgreementLink,
	id: string,
): Promise<string> {
	const now = Date.now(),
		creator = await creatorFor(question);
	const document = {
		statementId: id,
		statement: title,
		statementType: 'agreement',
		parentId: question.statementId,
		topParentId: question.topParentId || question.statementId,
		parents: [...(question.parents || []), question.statementId],
		creatorId: creator.uid,
		creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		isDocument: true,
		membership: question.membership || {},
		statementSettings: { ...question.statementSettings, enableAddEvaluationOption: false },
		agreementMeta: meta,
	};
	if (parts.length > DELIBERATION_LIMITS.paragraphs)
		throw new HttpsError('resource-exhausted', 'An agreement can have at most 100 paragraphs.');
	const batch = db.batch();
	batch.create(statements.doc(id), document);
	parts.forEach((part, order) => {
		const paragraph = createParagraphChildStatement({
			content: part.text,
			host: { statementId: id, topParentId: id },
			creator,
			order,
			blockType: part.type as ParagraphType,
			sourceApp: SourceApp.SIGN,
			isOfficial: true,
		});
		if (!paragraph) throw new Error('Could not build paragraph.');
		batch.create(statements.doc(paragraph.statementId), { ...paragraph, consensus: 0 });
	});
	batch.set(db.collection(Collections.statementsSubscribe).doc(`${creator.uid}--${id}`), {
		userId: creator.uid,
		user: creator,
		statementId: id,
		statement: document,
		statementType: 'agreement',
		isDocument: true,
		parentId: question.statementId,
		topParentId: document.topParentId,
		role: 'statement-creator',
		createdAt: now,
		lastUpdate: now,
		statementsSubscribeId: `${creator.uid}--${id}`,
	});
	batch.set(workflows.doc(question.statementId).collection('sources').doc(id), {
		sourceHash: meta.sourceHash,
		sourceIds: meta.sourceIds,
		createdAt: now,
	});
	await batch.commit();

	return id;
}
