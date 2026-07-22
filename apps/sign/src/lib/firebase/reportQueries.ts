/**
 * Server-side aggregation for the Document Report (JSON + AI narrative input).
 * Joins paragraphViews × approvals × evaluations × comments × signatures into
 * a self-describing, anonymized DocumentReport.
 */

import {
	Collections,
	DEMOGRAPHIC_CONSTANTS,
	DOCUMENT_REPORT_VERSION,
	Statement,
	StatementType,
} from '@freedi/shared-types';
import type {
	DemographicQuestionSummary,
	DocumentReport,
	DocumentReportFunnel,
	DocumentReportInsights,
	DocumentReportSchema,
	DocumentSignatureStats,
	DropOffPoint,
	ParagraphReport,
	ParagraphRef,
	ReadThroughPoint,
	ReportComment,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from './admin';
import { getDocumentParagraphs } from './queries';
import type { Signature, Approval } from './queries';
import {
	createAnonymousIdMap,
	getAllDocumentUserIds,
	getDemographicQuestionsForExport,
	getAnonymizedDemographicAnswers,
} from './exportQueries';
import { StatementWithParagraphs, Paragraph } from '@/types';
import { logError } from '@/lib/utils/errorHandling';

const PARAGRAPH_VIEWS_COLLECTION = 'paragraphViews';
const TEXT_PREVIEW_LENGTH = 200;
/** Minimum voters before a paragraph can rank as consensus/friction. */
const MIN_VOTERS_FOR_RANKING = 3;
/** Retention drop (0..1) between consecutive paragraphs flagged as drop-off. */
const DROP_OFF_THRESHOLD = 0.15;
const TOP_PARAGRAPHS_COUNT = 3;
/** Per-paragraph comment caps to keep the report LLM-sized. */
const MAX_TOP_LIKED_COMMENTS = 15;
const MAX_TOP_DISLIKED_COMMENTS = 5;

interface ParagraphViewDoc {
	paragraphId: string;
	visitorId: string;
	documentId: string;
	duration?: number;
}

interface EvaluationDoc {
	statementId: string;
	evaluation: number;
	evaluatorId?: string;
	odlUserId?: string;
	odluserId?: string;
}

function textPreview(content: string): string {
	const clean = content.replace(/<[^>]*>/g, '').trim();

	return clean.length > TEXT_PREVIEW_LENGTH
		? `${clean.slice(0, TEXT_PREVIEW_LENGTH)}…`
		: clean;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function buildReportSchemaDoc(): DocumentReportSchema {
	return {
		reportVersion: 'Schema version of this report.',
		'metadata.documentId': 'Firestore id of the document statement.',
		'metadata.language': "Document language (signSettings.defaultLanguage, fallback 'en'). The narrative report should be written in this language.",
		'metadata.kAnonymity': 'Minimum people per demographic segment; smaller segments are suppressed.',
		'funnel.uniqueVisitors': 'Distinct visitors with at least one recorded paragraph view (>=5s dwell).',
		'funnel.commenters': 'Distinct authors of at least one visible comment.',
		'funnel.approvers': 'Distinct users who voted on at least one paragraph (boolean approve/reject OR ±1 evaluation — documents typically use one of the two mechanisms).',
		'funnel.signers': "Users whose whole-document signature status is 'signed'.",
		'funnel.rejecters': "Users whose whole-document signature status is 'rejected'.",
		'funnel.viewedOnlySignatures': "Signature records with status 'viewed'. IMPORTANT: in satisfaction mode these users typically DID respond by rating the document — see documentSignatures.satisfactionCount before interpreting this as incomplete participation.",
		'paragraphs[]': 'Per-paragraph stats, ordered by position in the document.',
		'paragraphs[].views.total': 'Recorded views (one per visitor per paragraph, >=5s dwell).',
		'paragraphs[].views.uniqueViewers': 'Distinct visitors who viewed this paragraph.',
		'paragraphs[].views.avgDurationSeconds': 'Mean dwell time in seconds (null when no views).',
		'paragraphs[].views.readThroughPct': 'uniqueViewers / funnel.uniqueVisitors, 0..1.',
		'paragraphs[].approval': 'Boolean approve/reject votes on this paragraph: approved count, totalVoters, averageApproval = approved/totalVoters (0..1).',
		'paragraphs[].evaluations': 'Thumb evaluations on this paragraph: pro (+1 count), con (-1 count), avg (-1..1), total.',
		'paragraphs[].comments.count': 'Total visible comments on this paragraph (items may be capped below this).',
		'paragraphs[].comments.items[].anonymousId': 'Stable pseudonym (user_N); real identities are never included.',
		'paragraphs[].comments.items[].likes': 'Positive evaluations this comment received.',
		'paragraphs[].comments.items[].dislikes': 'Negative evaluations this comment received.',
		'documentSignatures.signed': 'Whole-document signatures. Can be 0 in satisfaction mode even when the community responded — check satisfactionCount.',
		'documentSignatures.rejected': 'Whole-document rejections. Can be 0 in satisfaction mode — check satisfactionNegative.',
		'documentSignatures.satisfactionCount': 'Users who rated the whole document on the -1..+1 satisfaction scale. In satisfaction mode this IS the document-level verdict: approve/reject are the +1/-1 endpoints of the same scale, so a satisfaction rating is a completed response, not an abandoned one.',
		'documentSignatures.satisfactionPositive': 'Satisfaction ratings > 0 (leaning approve).',
		'documentSignatures.satisfactionNegative': 'Satisfaction ratings < 0 (leaning reject).',
		'documentSignatures.averageSatisfaction': 'Mean satisfaction (-1..1) when the document uses satisfaction mode (null when unused).',
		'documentSignatures.rejectionReasons[]': 'Free-text reasons given when rejecting the document (anonymous).',
		'insights.topConsensus[]': 'Paragraphs with the highest support (minimum voter floor applied); score = support 0..1, from boolean approvals when present, otherwise from ±1 evaluations mapped to 0..1.',
		'insights.topFriction[]': 'Paragraphs with the lowest support / most negative signals; score = support 0..1 (same derivation as topConsensus).',
		'insights.readThroughCurve[]': 'Reader retention per paragraph in document order (uniqueViewers / uniqueVisitors).',
		'insights.dropOff[]': `Paragraphs where retention falls more than ${DROP_OFF_THRESHOLD * 100}% versus the previous paragraph.`,
		'demographics[]': 'Answer distributions per demographic question; answers below the k-anonymity floor are suppressed.',
	};
}

/**
 * Build the full DocumentReport for a Sign document.
 * All user identifiers are replaced with stable anonymous ids.
 */
export async function buildDocumentReport(
	document: StatementWithParagraphs
): Promise<DocumentReport> {
	const db = getFirestoreAdmin();
	const documentId = document.statementId;
	const topParentId = document.topParentId || documentId;

	try {
		const paragraphs: Paragraph[] = await getDocumentParagraphs(document);
		const paragraphIds = paragraphs.map((p) => p.paragraphId);
		const paragraphIdSet = new Set(paragraphIds);

		const isDev = process.env.NODE_ENV === 'development';
		const minSegmentSize = isDev ? 0 : DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE;

		const userIds = await getAllDocumentUserIds(documentId);
		const userIdMap = createAnonymousIdMap(userIds);

		const [
			viewsSnap,
			approvalsSnap,
			commentsSnap,
			docEvaluationsSnap,
			signaturesSnap,
			demographicQuestions,
		] = await Promise.all([
			db.collection(PARAGRAPH_VIEWS_COLLECTION).where('documentId', '==', documentId).get(),
			db.collection(Collections.approval).where('documentId', '==', documentId).get(),
			db
				.collection(Collections.statements)
				.where('topParentId', '==', documentId)
				.where('statementType', '==', StatementType.statement)
				.get(),
			db.collection(Collections.evaluations).where('documentId', '==', documentId).get(),
			db.collection(Collections.signatures).where('documentId', '==', documentId).get(),
			getDemographicQuestionsForExport(documentId, topParentId),
		]);

		// ----- Views -----
		const allVisitors = new Set<string>();
		const viewersByParagraph = new Map<string, Set<string>>();
		const viewTotalsByParagraph = new Map<string, { total: number; durationSum: number; durationCount: number }>();

		viewsSnap.docs.forEach((doc) => {
			const view = doc.data() as ParagraphViewDoc;
			allVisitors.add(view.visitorId);
			if (!paragraphIdSet.has(view.paragraphId)) return;

			if (!viewersByParagraph.has(view.paragraphId)) {
				viewersByParagraph.set(view.paragraphId, new Set());
				viewTotalsByParagraph.set(view.paragraphId, { total: 0, durationSum: 0, durationCount: 0 });
			}
			viewersByParagraph.get(view.paragraphId)?.add(view.visitorId);
			const totals = viewTotalsByParagraph.get(view.paragraphId);
			if (totals) {
				totals.total += 1;
				if (typeof view.duration === 'number') {
					totals.durationSum += view.duration;
					totals.durationCount += 1;
				}
			}
		});

		const uniqueVisitors = allVisitors.size;

		// ----- Paragraph approvals (boolean approve/reject) -----
		const approvalsByParagraph = new Map<string, { approved: number; total: number }>();
		const approverIds = new Set<string>();

		approvalsSnap.docs.forEach((doc) => {
			const approval = doc.data() as Approval;
			const paragraphId = approval.paragraphId || approval.statementId;
			if (approval.userId) approverIds.add(approval.userId);
			if (!paragraphIdSet.has(paragraphId)) return;

			const entry = approvalsByParagraph.get(paragraphId) ?? { approved: 0, total: 0 };
			entry.total += 1;
			if (approval.approval) entry.approved += 1;
			approvalsByParagraph.set(paragraphId, entry);
		});

		// ----- Evaluations (±1 on paragraphs, likes/dislikes on comments) -----
		const paragraphEvals = new Map<string, { pro: number; con: number; sum: number; total: number }>();
		const commentEvals = new Map<string, { likes: number; dislikes: number }>();

		docEvaluationsSnap.docs.forEach((doc) => {
			const evaluation = doc.data() as EvaluationDoc;
			if (typeof evaluation.evaluation !== 'number') return;

			if (paragraphIdSet.has(evaluation.statementId)) {
				const evaluatorId =
					evaluation.odlUserId || evaluation.odluserId || evaluation.evaluatorId;
				if (evaluatorId) approverIds.add(evaluatorId);

				const entry = paragraphEvals.get(evaluation.statementId) ?? { pro: 0, con: 0, sum: 0, total: 0 };
				if (evaluation.evaluation > 0) entry.pro += 1;
				else if (evaluation.evaluation < 0) entry.con += 1;
				entry.sum += evaluation.evaluation;
				entry.total += 1;
				paragraphEvals.set(evaluation.statementId, entry);
			} else {
				const entry = commentEvals.get(evaluation.statementId) ?? { likes: 0, dislikes: 0 };
				if (evaluation.evaluation > 0) entry.likes += 1;
				else if (evaluation.evaluation < 0) entry.dislikes += 1;
				commentEvals.set(evaluation.statementId, entry);
			}
		});

		// ----- Comments -----
		const commentsByParagraph = new Map<string, ReportComment[]>();
		const commenterIds = new Set<string>();

		commentsSnap.docs.forEach((doc) => {
			const comment = doc.data() as Statement;
			if (comment.hide || !paragraphIdSet.has(comment.parentId)) return;

			commenterIds.add(comment.creatorId);
			const anonymousId = userIdMap.get(comment.creatorId) ?? 'user_unknown';
			const evals = commentEvals.get(comment.statementId) ?? { likes: 0, dislikes: 0 };

			const items = commentsByParagraph.get(comment.parentId) ?? [];
			items.push({
				anonymousId,
				text: comment.statement,
				likes: evals.likes,
				dislikes: evals.dislikes,
				createdAt: comment.createdAt,
			});
			commentsByParagraph.set(comment.parentId, items);
		});

		// ----- Signatures -----
		let signed = 0;
		let rejected = 0;
		let viewedOnly = 0;
		const satisfactions: number[] = [];
		const rejectionReasons: string[] = [];

		signaturesSnap.docs.forEach((doc) => {
			const signature = doc.data() as Signature;
			if (signature.signed === 'signed') signed += 1;
			else if (signature.signed === 'rejected') rejected += 1;
			else if (signature.signed === 'viewed') viewedOnly += 1;

			if (typeof signature.satisfaction === 'number') satisfactions.push(signature.satisfaction);
			if (signature.rejectionReason?.trim()) rejectionReasons.push(signature.rejectionReason.trim());
		});

		const documentSignatures: DocumentSignatureStats = {
			signed,
			rejected,
			viewed: viewedOnly,
			satisfactionCount: satisfactions.length,
			satisfactionPositive: satisfactions.filter((s) => s > 0).length,
			satisfactionNegative: satisfactions.filter((s) => s < 0).length,
			averageSatisfaction:
				satisfactions.length > 0
					? round2(satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length)
					: null,
			rejectionReasons,
		};

		// ----- Per-paragraph reports -----
		const sortedParagraphs = [...paragraphs].sort((a, b) => a.order - b.order);
		const paragraphReports: ParagraphReport[] = sortedParagraphs.map((paragraph, index) => {
			const viewTotals = viewTotalsByParagraph.get(paragraph.paragraphId);
			const uniqueViewers = viewersByParagraph.get(paragraph.paragraphId)?.size ?? 0;
			const approvalEntry = approvalsByParagraph.get(paragraph.paragraphId) ?? { approved: 0, total: 0 };
			const evalEntry = paragraphEvals.get(paragraph.paragraphId) ?? { pro: 0, con: 0, sum: 0, total: 0 };
			const allComments = commentsByParagraph.get(paragraph.paragraphId) ?? [];

			return {
				paragraphId: paragraph.paragraphId,
				order: index,
				textPreview: textPreview(paragraph.content),
				views: {
					total: viewTotals?.total ?? 0,
					uniqueViewers,
					avgDurationSeconds:
						viewTotals && viewTotals.durationCount > 0
							? round2(viewTotals.durationSum / viewTotals.durationCount)
							: null,
					readThroughPct: uniqueVisitors > 0 ? round2(uniqueViewers / uniqueVisitors) : 0,
				},
				approval: {
					approved: approvalEntry.approved,
					totalVoters: approvalEntry.total,
					averageApproval:
						approvalEntry.total > 0 ? round2(approvalEntry.approved / approvalEntry.total) : 0,
				},
				evaluations: {
					pro: evalEntry.pro,
					con: evalEntry.con,
					avg: evalEntry.total > 0 ? round2(evalEntry.sum / evalEntry.total) : 0,
					total: evalEntry.total,
				},
				comments: {
					count: allComments.length,
					items: capComments(allComments),
				},
			};
		});

		const funnel: DocumentReportFunnel = {
			uniqueVisitors,
			commenters: commenterIds.size,
			approvers: approverIds.size,
			signers: signed,
			rejecters: rejected,
			viewedOnlySignatures: viewedOnly,
		};

		const insights = buildInsights(paragraphReports);

		const demographicAnswers = await getAnonymizedDemographicAnswers(demographicQuestions, userIdMap);
		const demographics = buildDemographicSummaries(
			demographicQuestions,
			demographicAnswers,
			minSegmentSize
		);

		const signSettings = (document as unknown as { signSettings?: { defaultLanguage?: string } })
			.signSettings;

		return {
			_schema: buildReportSchemaDoc(),
			reportVersion: DOCUMENT_REPORT_VERSION,
			metadata: {
				documentId,
				title: document.statement,
				language: signSettings?.defaultLanguage || 'en',
				paragraphCount: paragraphReports.length,
				generatedAt: Date.now(),
				kAnonymity: minSegmentSize,
			},
			funnel,
			paragraphs: paragraphReports,
			documentSignatures,
			insights,
			demographics,
		};
	} catch (error) {
		logError(error, { operation: 'reportQueries.buildDocumentReport', documentId });
		throw error;
	}
}

/** Keep the most-liked and most-disliked comments so the LLM sees both poles. */
export function capComments(comments: ReportComment[]): ReportComment[] {
	if (comments.length <= MAX_TOP_LIKED_COMMENTS + MAX_TOP_DISLIKED_COMMENTS) {
		return [...comments].sort((a, b) => b.likes - b.dislikes - (a.likes - a.dislikes));
	}

	const byNetLikes = [...comments].sort((a, b) => b.likes - b.dislikes - (a.likes - a.dislikes));
	const top = byNetLikes.slice(0, MAX_TOP_LIKED_COMMENTS);
	const topIds = new Set(top.map((c) => `${c.anonymousId}:${c.createdAt}`));
	const mostDisliked = [...comments]
		.filter((c) => !topIds.has(`${c.anonymousId}:${c.createdAt}`))
		.sort((a, b) => b.dislikes - a.dislikes)
		.slice(0, MAX_TOP_DISLIKED_COMMENTS);

	return [...top, ...mostDisliked];
}

export function buildInsights(paragraphReports: ParagraphReport[]): DocumentReportInsights {
	const readThroughCurve: ReadThroughPoint[] = paragraphReports.map((p) => ({
		order: p.order,
		paragraphId: p.paragraphId,
		retention: p.views.readThroughPct,
	}));

	const dropOff: DropOffPoint[] = [];
	for (let i = 1; i < readThroughCurve.length; i++) {
		const before = readThroughCurve[i - 1].retention;
		const after = readThroughCurve[i].retention;
		if (before - after > DROP_OFF_THRESHOLD) {
			dropOff.push({
				paragraphId: readThroughCurve[i].paragraphId,
				order: readThroughCurve[i].order,
				retentionBefore: before,
				retentionAfter: after,
			});
		}
	}

	const ranked = paragraphReports
		.map((p) => ({ paragraph: p, support: paragraphSupport(p) }))
		.filter(
			(entry): entry is { paragraph: ParagraphReport; support: ParagraphSupport } =>
				entry.support !== null && entry.support.voters >= MIN_VOTERS_FOR_RANKING
		);

	const toRef = (p: ParagraphReport, support: ParagraphSupport, reason: string): ParagraphRef => ({
		paragraphId: p.paragraphId,
		order: p.order,
		textPreview: p.textPreview,
		score: support.value,
		reason,
	});

	const supportReason = (p: ParagraphReport, support: ParagraphSupport): string => {
		const pct = Math.round(support.value * 100);

		return support.source === 'approval'
			? `${p.approval.approved}/${p.approval.totalVoters} approved (${pct}%)`
			: `${p.evaluations.pro} in favor, ${p.evaluations.con} against (${pct}% support)`;
	};

	const topConsensus = [...ranked]
		.sort((a, b) => b.support.value - a.support.value)
		.slice(0, TOP_PARAGRAPHS_COUNT)
		.map(({ paragraph, support }) => toRef(paragraph, support, supportReason(paragraph, support)));

	const topFriction = [...ranked]
		.sort((a, b) => a.support.value - b.support.value)
		.slice(0, TOP_PARAGRAPHS_COUNT)
		.filter(({ support }) => support.value < 1)
		.map(({ paragraph, support }) =>
			toRef(
				paragraph,
				support,
				`${supportReason(paragraph, support)}, ${paragraph.comments.count} comments`
			)
		);

	return { topConsensus, topFriction, readThroughCurve, dropOff };
}

interface ParagraphSupport {
	/** Support level 0..1. */
	value: number;
	voters: number;
	source: 'approval' | 'evaluations';
}

/**
 * Unified support signal for a paragraph: boolean approvals when present,
 * otherwise ±1 evaluations mapped from -1..1 to 0..1. Null when nobody voted.
 */
export function paragraphSupport(p: ParagraphReport): ParagraphSupport | null {
	if (p.approval.totalVoters > 0) {
		return { value: p.approval.averageApproval, voters: p.approval.totalVoters, source: 'approval' };
	}

	if (p.evaluations.total > 0) {
		return {
			value: round2((p.evaluations.avg + 1) / 2),
			voters: p.evaluations.total,
			source: 'evaluations',
		};
	}

	return null;
}

interface DemographicAnswerLike {
	questionId: string;
	answer: string | null;
	answerOptions: string[] | null;
	anonymousId: string;
}

interface DemographicQuestionLike {
	questionId: string;
	text: string;
	options: string[];
}

export function buildDemographicSummaries(
	questions: DemographicQuestionLike[],
	answers: DemographicAnswerLike[],
	minSegmentSize: number
): DemographicQuestionSummary[] {
	return questions.map((question) => {
		const questionAnswers = answers.filter((a) => a.questionId === question.questionId);
		const respondents = new Set(questionAnswers.map((a) => a.anonymousId));

		const counts = new Map<string, Set<string>>();
		questionAnswers.forEach((answer) => {
			const values = [
				...(answer.answer ? [answer.answer] : []),
				...(answer.answerOptions ?? []),
			];
			values.forEach((value) => {
				if (!counts.has(value)) counts.set(value, new Set());
				counts.get(value)?.add(answer.anonymousId);
			});
		});

		return {
			demographicQuestionId: question.questionId,
			questionText: question.text,
			totalRespondents: respondents.size,
			answers: [...counts.entries()].map(([answer, users]) => {
				const suppressed = minSegmentSize > 0 && users.size < minSegmentSize;

				return {
					answer,
					count: suppressed ? 0 : users.size,
					suppressedByKAnonymity: suppressed,
				};
			}),
		};
	});
}
