/**
 * The question stage: creating its question Statement when a plan is set,
 * and closing it when the admin moves on — the moment its answers are
 * ranked, the admin's cutoff applied, and an AI summary written, so the
 * later stages can show "here is what the room said".
 *
 * Answers are ordinary option Statements under the item's own question
 * Statement, rated through the shared evaluation pipeline, so the net
 * agreement read here is the statement's own `evaluation.averageEvaluation`
 * — no synthetic raters ever touch a question stage.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCarriedAnswer,
	AgoraSession,
	AgoraStagePlanItem,
	AgoraTopicPackage,
	Statement,
	StatementType,
	SourceApp,
	createStatementObject,
	resolveQuestionSelection,
	rankCarriedAnswers,
	selectCarriedAnswers,
	statementToSimpleStatement,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';

interface Creator {
	uid: string;
	displayName: string;
	email: string | null;
	photoURL: string | null;
	isAnonymous: boolean;
}

/** The question Statement a question item hangs its answers off */
export function buildQuestionStatement(params: {
	item: AgoraStagePlanItem;
	sessionId: string;
	rootStatementId: string;
	creatorId: string;
	creator: Creator;
}): Statement | undefined {
	const built = createStatementObject({
		statement: (params.item.title ?? '').trim(),
		statementType: StatementType.question,
		parentId: params.rootStatementId,
		topParentId: params.rootStatementId,
		parents: [params.rootStatementId],
		creatorId: params.creatorId,
		creator: params.creator,
		sourceApp: SourceApp.AGORA,
		agoraSessionId: params.sessionId,
	});
	if (!built) return undefined;

	const explanation = (params.item.explanation ?? '').trim();

	return explanation ? { ...built, description: explanation } : built;
}

/** An answer row as the closing reads it off the statement doc */
function toCarriedAnswer(statement: Statement, named: boolean): AgoraCarriedAnswer {
	const raters = Number(statement.evaluation?.numberOfEvaluators ?? 0);
	const mean = raters > 0 ? Number(statement.evaluation?.averageEvaluation ?? 0) : 0;

	return {
		statementId: statement.statementId,
		statement: statement.statement,
		mean: Number.isFinite(mean) ? mean : 0,
		raters,
		...(named && statement.anonName ? { anonName: statement.anonName } : {}),
	};
}

/**
 * Summarise the answers that travel forward. Deterministic without a model:
 * the selected answers themselves, joined — honest, and enough for the
 * carried-context card to be readable in a fixture run.
 */
async function summariseAnswers(
	question: string,
	selected: AgoraCarriedAnswer[],
	language: string,
): Promise<string> {
	if (selected.length === 0) return '';
	const fixture = selected.map((row) => row.statement).join(' · ');
	if (!process.env.OPENAI_API_KEY) return fixture;

	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system: `You summarise what a small group answered to a question, for the group itself to read in the next step of their conversation. Respond ONLY with JSON: {"summary": string}. The summary is 1-3 sentences in language "${language}", neutral, concrete, names the shared themes and any real tension, never invents an answer nobody gave.`,
			user: `Question: ${question}\n\nAnswers (net agreement in brackets, -1..1):\n${selected
				.map((row) => `- [${row.mean.toFixed(2)}] ${row.statement}`)
				.join('\n')}`,
			maxTokens: 400,
			temperature: 0.3,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as { summary?: unknown };

		return typeof parsed.summary === 'string' && parsed.summary.trim()
			? parsed.summary.trim()
			: fixture;
	} catch (error) {
		logError(error, { operation: 'agora.questionStage.summarise' });

		return fixture;
	}
}

/**
 * Close a question item: rank its answers, apply the cutoff, write the AI
 * summary, and stamp the outcome onto `stageState[itemId]`. Also marks the
 * selected answers `isChosen` and writes `results` on the question
 * Statement, so the main app reads the same choice off the statement tree.
 * Idempotent: a second close (a redelivered advance) rewrites the same
 * outcome from the same data.
 */
export async function closeQuestionStage(
	sessionId: string,
	item: AgoraStagePlanItem,
): Promise<void> {
	if (!item.statementId) return;
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
			.filter((statement) => statement.parentId === item.statementId);

		const rows = rankCarriedAnswers(answers.map((statement) => toCarriedAnswer(statement, named)));
		const selected = selectCarriedAnswers(rows, resolveQuestionSelection(item));

		const topicSnap = await db
			.collection(Collections.agoraTopicPackages)
			.doc(session.topicPackageId)
			.get();
		const language = (topicSnap.data() as AgoraTopicPackage | undefined)?.language ?? 'he';
		const summary = await summariseAnswers(item.title ?? '', selected, language);

		const outcome = {
			selected,
			...(summary ? { summary } : {}),
			computedAt: Date.now(),
		};

		const batch = db.batch();
		const chosen = new Set(selected.map((row) => row.statementId));
		answers.forEach((statement) => {
			batch.update(db.collection(Collections.statements).doc(statement.statementId), {
				isChosen: chosen.has(statement.statementId),
			});
		});
		batch.update(db.collection(Collections.statements).doc(item.statementId), {
			results: answers
				.filter((statement) => chosen.has(statement.statementId))
				.map((statement) => statementToSimpleStatement(statement)),
			lastUpdate: Date.now(),
		});
		batch.update(sessionRef, new FieldPath('stageState', item.itemId, 'outcome'), outcome);
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'agora.closeQuestionStage',
			metadata: { sessionId, itemId: item.itemId },
		});
	}
}
