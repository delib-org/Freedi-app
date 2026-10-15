import { AgoraMessageKind, type AgoraParticipant } from '@freedi/shared-types';
import type { AgoraProposal } from '../proposals';

/**
 * Every line a student wrote in this session, as one flat list the teacher
 * can read, filter and act on. Pure: the "what they wrote" panel hands it the
 * deliberation state and gets rows back (grouping and search live in
 * writingGroups.ts).
 */
export type TextKind = 'proposal' | 'answer' | 'suggestion' | 'chat' | 'pitch';

export interface TextRow {
	statementId: string;
	kind: TextKind;
	authorUid: string;
	anonName: string;
	text: string;
	createdAt: number;
	lastUpdate: number;
	hidden: boolean;
	editedByTeacher: boolean;
	/** suggestion / chat: the proposal the thread hangs off */
	proposalId?: string;
	/** Where it was written: one key per question, per square, per proposal thread */
	contextKey: string;
	/** Plan position of that place, so groups sort in the order the lesson ran */
	contextOrder: number;
	/** answer: the question it answers */
	questionId?: string;
	/** suggestion / chat: the proposal's words, to say what the thread is about */
	proposalText?: string;
}

/** A question stage as the plan names it */
export interface QuestionRef {
	id: string;
	/** May be blank: a WizCol round's prompt is the kind's, not the teacher's */
	title: string;
	/** 1-based position among the plan's question stages */
	number: number;
	/** Plan index of the stage */
	order: number;
}

export interface TextSources {
	proposals: readonly AgoraProposal[];
	answersByQuestion: Readonly<Record<string, readonly AgoraProposal[]>>;
	suggestions: Readonly<Record<string, readonly AgoraProposal[]>>;
	participants: readonly AgoraParticipant[];
	/**
	 * Students the teacher removed (session.removedUids). Their seats are gone
	 * but their words stay on the board — and so stay in reach of the
	 * teacher's take-down.
	 */
	removedUids?: readonly string[];
	/** The pitch a student made during a challenge round, if one is standing */
	challengerStatementId?: string;
	/** The plan's question stages, for the "where was this written" label */
	questions?: readonly QuestionRef[];
	/** Plan index of the square (deliberation stage); proposals sort under it */
	squareOrder?: number;
	/**
	 * Lines the teacher took down: the live listener keeps them out of the
	 * three collections above, so they arrive here and are filed by the same
	 * parent rule the listener uses.
	 */
	hiddenOthers?: readonly AgoraProposal[];
	/** The square's question — the parent that makes an option a proposal, not an answer */
	challengeQuestionId?: string;
}

export interface TextFilter {
	studentUid?: string;
	kind?: TextKind;
	showHidden: boolean;
}

interface Where {
	contextKey: string;
	contextOrder: number;
	questionId?: string;
	proposalText?: string;
}

const UNPLANNED_ORDER = 1000;

function row(item: AgoraProposal, kind: TextKind, where: Where, proposalId?: string): TextRow {
	return {
		statementId: item.statementId,
		kind,
		authorUid: item.creatorId,
		anonName: item.anonName,
		text: item.statement,
		createdAt: item.createdAt,
		lastUpdate: item.lastUpdate,
		hidden: item.hidden === true,
		editedByTeacher: item.teacherEdited === true,
		...where,
		...(proposalId ? { proposalId } : {}),
	};
}

/**
 * Newest first, students only — removed ones included (the AI raters never
 * write), system lines dropped. A line the teacher deleted for good is gone
 * from the list altogether.
 */
export function buildTextRows(sources: TextSources): TextRow[] {
	const students = new Set([
		...sources.participants.map((participant) => participant.userId),
		...(sources.removedUids ?? []),
	]);
	const rows: TextRow[] = [];
	const squareOrder = sources.squareOrder ?? UNPLANNED_ORDER / 2;
	const proposalById = new Map<string, AgoraProposal>();
	for (const proposal of sources.proposals) proposalById.set(proposal.statementId, proposal);

	// Fold the taken-down lines back in beside their live neighbours
	const proposals = [...sources.proposals];
	const answersByQuestion: Record<string, AgoraProposal[]> = {};
	for (const [id, list] of Object.entries(sources.answersByQuestion))
		answersByQuestion[id] = [...list];
	const suggestions: Record<string, AgoraProposal[]> = {};
	for (const [id, list] of Object.entries(sources.suggestions)) suggestions[id] = [...list];
	for (const item of sources.hiddenOthers ?? []) {
		if (item.statementType === 'option') {
			if (sources.challengeQuestionId && item.parentId !== sources.challengeQuestionId) {
				(answersByQuestion[item.parentId] ??= []).push(item);
			} else {
				proposals.push(item);
			}
		} else if (item.statementType === 'suggestion') {
			(suggestions[item.parentId] ??= []).push(item);
		}
	}

	for (const proposal of proposals) {
		if (!students.has(proposal.creatorId) || proposal.deleted) continue;
		const isPitch = proposal.statementId === sources.challengerStatementId;
		rows.push(
			row(proposal, isPitch ? 'pitch' : 'proposal', {
				contextKey: 'square',
				contextOrder: squareOrder,
			}),
		);
	}
	for (const [questionId, answers] of Object.entries(answersByQuestion)) {
		const question = sources.questions?.find((candidate) => candidate.id === questionId);
		for (const answer of answers) {
			if (!students.has(answer.creatorId) || answer.deleted) continue;
			rows.push(
				row(answer, 'answer', {
					contextKey: `q:${questionId}`,
					contextOrder: question?.order ?? UNPLANNED_ORDER,
					questionId,
				}),
			);
		}
	}
	for (const [proposalId, thread] of Object.entries(suggestions)) {
		const parent = proposalById.get(proposalId);
		for (const message of thread) {
			if (!students.has(message.creatorId) || message.deleted) continue;
			const kind = message.agoraMessageKind;
			if (kind === AgoraMessageKind.edit || kind === AgoraMessageKind.award) continue;
			rows.push(
				row(
					message,
					kind === AgoraMessageKind.chat ? 'chat' : 'suggestion',
					{
						contextKey: `p:${proposalId}`,
						contextOrder: squareOrder + 0.5,
						...(parent && !parent.hidden && parent.statement
							? { proposalText: parent.statement }
							: {}),
					},
					proposalId,
				),
			);
		}
	}

	return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function filterRows(rows: readonly TextRow[], filter: TextFilter): TextRow[] {
	return rows.filter(
		(item) =>
			(filter.showHidden || !item.hidden) &&
			(!filter.studentUid || item.authorUid === filter.studentUid) &&
			(!filter.kind || item.kind === filter.kind),
	);
}

/** Who wrote at all — the student filter's options, by pseudonym */
export function authorsOf(rows: readonly TextRow[]): Array<{ uid: string; anonName: string }> {
	const seen = new Map<string, string>();
	for (const item of rows) if (!seen.has(item.authorUid)) seen.set(item.authorUid, item.anonName);

	return [...seen.entries()]
		.map(([uid, anonName]) => ({ uid, anonName }))
		.sort((a, b) => a.anonName.localeCompare(b.anonName));
}
