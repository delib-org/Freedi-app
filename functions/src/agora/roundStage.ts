/**
 * The WizCol rounds on the server: the closing of a question item whose
 * kind is a round — every text ranked by the round's own scale, and an AI
 * record written for the stages that follow. `closeQuestionStage` sends a
 * round here; its Statement is built by the same `buildQuestionStatement`
 * every question item uses.
 *
 * A round's answers are ordinary option Statements under the item's own
 * question Statement, weighed through the shared evaluation pipeline like an
 * open question's; the scale lives in `AGORA_ROUNDS` (shared-types) so this
 * file and the phones agree on what a heart and a 0…1 step mean.
 *
 * Unlike a question stage, a round carries EVERYTHING — no cutoff, no
 * bands. C_p is meaningless on a 0…1 scale, and the point of a round is
 * the record, not the ranking: what the class has lived through, what it
 * needs, where it wants to be.
 */

import { db } from '../db';
import {
	Collections,
	AgoraCarriedAnswer,
	AgoraRoundKind,
	AgoraSession,
	AgoraStagePlanItem,
	AgoraStageOutcome,
	AgoraTopicPackage,
	AGORA_ROUNDS,
	Statement,
	StatementType,
	isAgoraHidden,
	rankRoundAnswers,
	roundLikes,
	roundSpecOf,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';
import { toCarriedAnswer, writeOutcome } from './carryOutcome';

const SUMMARY_MAX_TOKENS = 600;
const SUMMARY_TEMPERATURE = 0.3;

/** What each kind's record IS — the model writes the prose, the shape is ours */
function systemPrompt(kind: AgoraRoundKind, language: string): string {
	switch (AGORA_ROUNDS[kind].summary) {
		case 'stories':
			return `You write for a class and its teacher ONE paragraph (2-4 sentences, in language "${language}") about what this group has lived through around the issue: the situations that recur across the stories, the feelings in them, and where the experiences differ. Concrete and warm. No names, no counts, never invent a story nobody told, never rank the stories or pick a best one. Respond ONLY with JSON: {"summary": string}.`;
		case 'needs':
			return `Cluster these students' needs (each began "on this issue it matters to me that…") into 3-6 needs. Respond ONLY with JSON: {"summary": string} where "summary" is a list, one need per line, each line "• <the need in 3-8 words> — <one sentence in language "${language}" in the students' own terms>". Every line must be traceable to at least two students' texts. A need is not a solution — rewrite any solution as the need behind it. Never add a need nobody wrote.`;
		case 'merge':
			return `Merge every vision into ONE shared vision: 3-5 sentences in language "${language}", first person plural, present tense, as if it already happened. Keep every element two or more students share, keep one striking detail per distinct vision where it does not contradict the rest, describe the SITUATION and never the way it was reached, and add nothing nobody wrote. Respond ONLY with JSON: {"summary": string}.`;
		default:
			return `Summarise these texts in language "${language}". Respond ONLY with JSON: {"summary": string}.`;
	}
}

/** The texts as the prompt lists them: the round's own figure in brackets */
function textLines(kind: AgoraRoundKind, rows: readonly AgoraCarriedAnswer[]): string {
	return rows
		.map((row) =>
			AGORA_ROUNDS[kind].scale === 'like'
				? `- [${roundLikes(row)} likes] ${row.statement}`
				: `- [mean ${row.mean.toFixed(2)}, ${row.raters} rated] ${row.statement}`,
		)
		.join('\n');
}

/**
 * The record without a model: the texts themselves, joined — a needs list
 * as bullet lines, the rest as one line. Honest, and readable on the cards.
 */
export function roundFixture(kind: AgoraRoundKind, rows: readonly AgoraCarriedAnswer[]): string {
	if (rows.length === 0) return '';
	if (AGORA_ROUNDS[kind].summary === 'needs') {
		return rows.map((row) => `• ${row.statement}`).join('\n');
	}

	return rows.map((row) => row.statement).join(' · ');
}

/**
 * The AI record of a round. Falls back to the fixture when no model is
 * configured or the model misbehaves — a round must close either way.
 */
export async function summariseRound(
	kind: AgoraRoundKind,
	promptText: string,
	mainQuestion: string,
	rows: readonly AgoraCarriedAnswer[],
	language: string,
): Promise<string> {
	const fixture = roundFixture(kind, rows);
	if (rows.length === 0) return fixture;
	if (!process.env.OPENAI_API_KEY) return fixture;

	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system: systemPrompt(kind, language),
			user: [
				`The issue the group deliberates: ${mainQuestion}`,
				`What they were asked: ${promptText}`,
				'',
				'Their texts:',
				textLines(kind, rows),
			].join('\n'),
			maxTokens: SUMMARY_MAX_TOKENS,
			temperature: SUMMARY_TEMPERATURE,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as { summary?: unknown };

		return typeof parsed.summary === 'string' && parsed.summary.trim()
			? parsed.summary.trim()
			: fixture;
	} catch (error) {
		logError(error, { operation: 'agora.roundStage.summarise', metadata: { kind } });

		return fixture;
	}
}

/**
 * Close a round: rank every text by the round's scale, write the record,
 * and stamp `stageState[itemId].outcome` — all texts carried, no bands.
 * Idempotent: a second close rewrites the same outcome from the same data.
 */
export async function closeRoundStage(sessionId: string, item: AgoraStagePlanItem): Promise<void> {
	const spec = roundSpecOf(item);
	if (!item.statementId || !spec) return;
	const { kind } = spec;
	try {
		const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
		const [sessionSnap, answersSnap] = await Promise.all([
			sessionRef.get(),
			db
				.collection(Collections.statements)
				.where('agoraSessionId', '==', sessionId)
				.where('statementType', '==', StatementType.option)
				.get(),
		]);
		if (!sessionSnap.exists) return;
		const session = sessionSnap.data() as AgoraSession;
		const named = session.identity === 'named';

		const answers = answersSnap.docs
			.map((docSnap) => docSnap.data() as Statement)
			.filter((statement) => statement.parentId === item.statementId && !isAgoraHidden(statement));

		const selected = rankRoundAnswers(
			kind,
			answers.map((statement) => toCarriedAnswer(statement, named)),
		);

		const [topicSnap, challengeSnap] = await Promise.all([
			db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId).get(),
			db.collection(Collections.statements).doc(session.challengeQuestionId).get(),
		]);
		const language = (topicSnap.data() as AgoraTopicPackage | undefined)?.language ?? 'he';
		const mainQuestion = (challengeSnap.data() as Statement | undefined)?.statement ?? '';
		const summary = await summariseRound(
			kind,
			item.title ?? kind,
			mainQuestion,
			selected,
			language,
		);

		const outcome: AgoraStageOutcome = {
			selected,
			...(summary ? { summary } : {}),
			computedAt: Date.now(),
		};

		await writeOutcome({ sessionId, item, answers, outcome });
	} catch (error) {
		logError(error, {
			operation: 'agora.closeRoundStage',
			metadata: { sessionId, itemId: item.itemId, kind },
		});
	}
}
