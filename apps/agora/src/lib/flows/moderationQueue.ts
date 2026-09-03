import { AgoraMessageKind, type AgoraParticipant } from '@freedi/shared-types';
import type { AgoraProposal } from '../proposals';

/**
 * Every line a student wrote in this session, as one flat list the teacher
 * can read, filter and act on. Pure: the Messages tab hands it the
 * deliberation state and gets rows back.
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
}

export interface TextSources {
	proposals: readonly AgoraProposal[];
	answersByQuestion: Readonly<Record<string, readonly AgoraProposal[]>>;
	suggestions: Readonly<Record<string, readonly AgoraProposal[]>>;
	participants: readonly AgoraParticipant[];
	/** The pitch a student made during a challenge round, if one is standing */
	challengerStatementId?: string;
}

export interface TextFilter {
	studentUid?: string;
	kind?: TextKind;
	showHidden: boolean;
}

function row(item: AgoraProposal, kind: TextKind, proposalId?: string): TextRow {
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
		...(proposalId ? { proposalId } : {}),
	};
}

/** Newest first, students only (the AI raters never write), system lines dropped */
export function buildTextRows(sources: TextSources): TextRow[] {
	const students = new Set(sources.participants.map((participant) => participant.userId));
	const rows: TextRow[] = [];

	for (const proposal of sources.proposals) {
		if (!students.has(proposal.creatorId)) continue;
		const isPitch = proposal.statementId === sources.challengerStatementId;
		rows.push(row(proposal, isPitch ? 'pitch' : 'proposal'));
	}
	for (const answers of Object.values(sources.answersByQuestion)) {
		for (const answer of answers) {
			if (students.has(answer.creatorId)) rows.push(row(answer, 'answer'));
		}
	}
	for (const [proposalId, thread] of Object.entries(sources.suggestions)) {
		for (const message of thread) {
			if (!students.has(message.creatorId)) continue;
			const kind = message.agoraMessageKind;
			if (kind === AgoraMessageKind.edit || kind === AgoraMessageKind.award) continue;
			rows.push(row(message, kind === AgoraMessageKind.chat ? 'chat' : 'suggestion', proposalId));
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
