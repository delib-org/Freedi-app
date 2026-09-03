/**
 * The question stage: creating its question Statement when a plan is set,
 * and closing it when the admin moves on — the moment its answers are
 * ranked, the admin's cutoff applied, and an AI record written, so the
 * later stages can show "here is what the room said".
 *
 * Answers are ordinary option Statements under the item's own question
 * Statement, rated through the shared evaluation pipeline, so both figures
 * read here are the statement's own: `evaluation.averageEvaluation` for the
 * net agreement the cards showed while rating, and `consensus` (C_p) for the
 * record — no synthetic raters ever touch a question stage.
 *
 * The record is banded, not flat. The AI is asked for one line per C_p band
 * (see `models/agora/questionSummary`), so the room reads what it is firmly
 * behind apart from what it merely leaned toward, and a proposal three
 * friends loved cannot pass itself off as the class's position.
 */

import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCarriedAnswer,
	AgoraCpBand,
	AgoraCpBandSummary,
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
	cpOf,
	groupByCpBand,
	rankByCp,
	isAgoraHidden,
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
	const consensus = Number(statement.consensus ?? Number.NaN);

	return {
		statementId: statement.statementId,
		statement: statement.statement,
		mean: Number.isFinite(mean) ? mean : 0,
		...(raters > 0 && Number.isFinite(consensus) ? { consensus } : {}),
		raters,
		...(named && statement.anonName ? { anonName: statement.anonName } : {}),
	};
}

/** The band as the prompt names it — plain words, so the model bands as we do */
const BAND_BRIEF: Record<AgoraCpBand, string> = {
	strong: 'the room is firmly behind these — high agreement AND enough raters to trust it',
	emerging: 'real support that is not yet firm — a mild yes, or too few raters to be sure',
	contested: 'no agreement here — the room is split, or leans against',
	unrated: 'nobody weighed these at all',
};

interface BandedSummary {
	/** The one-line overall record, for the folded carried-context card */
	summary: string;
	bands: AgoraCpBandSummary[];
}

/** The answers of one band, as the prompt lists them */
function bandLines(rows: readonly AgoraCarriedAnswer[]): string {
	return rows
		.map((row) => `- [C_p ${cpOf(row).toFixed(2)}, ${row.raters} rated] ${row.statement}`)
		.join('\n');
}

/** Mean C_p of a band, for the one figure its panel prints */
function bandConsensus(rows: readonly AgoraCarriedAnswer[]): number {
	const rated = rows.filter((row) => row.raters > 0);
	if (rated.length === 0) return 0;

	return rated.reduce((sum, row) => sum + cpOf(row), 0) / rated.length;
}

/**
 * Read the answers that travel forward, band by band. Deterministic without
 * a model: each band's own answers, joined — honest, and enough for the
 * outcome card to be readable in a fixture run.
 */
async function summariseAnswers(
	question: string,
	selected: AgoraCarriedAnswer[],
	language: string,
): Promise<BandedSummary> {
	if (selected.length === 0) return { summary: '', bands: [] };

	const groups = groupByCpBand(rankByCp(selected));
	const skeleton: AgoraCpBandSummary[] = groups.map((group) => ({
		band: group.band,
		text: group.rows.map((row) => row.statement).join(' · '),
		statementIds: group.rows.map((row) => row.statementId),
		consensus: bandConsensus(group.rows),
	}));
	const fixture: BandedSummary = {
		summary: selected.map((row) => row.statement).join(' · '),
		bands: skeleton,
	};
	if (!process.env.OPENAI_API_KEY) return fixture;

	const prompt = [
		`Question: ${question}`,
		'',
		'Bands, strongest consensus first (C_p in brackets, -1..1; C_p is the average rating with a penalty for how few people rated):',
		...groups.map(
			(group) => `\n## band "${group.band}" — ${BAND_BRIEF[group.band]}\n${bandLines(group.rows)}`,
		),
	].join('\n');

	try {
		const raw = await callLLM({
			model: WORKER_MODEL,
			system: `You write the record of what a small group answered to a question, for the group itself — students and their teacher — to read in the next step of their conversation. The answers are already sorted into consensus bands for you; the band, not your own judgement, decides how firmly you may say the group holds something. Respond ONLY with JSON: {"summary": string, "bands": [{"band": string, "text": string}]}. "summary" is ONE sentence in language "${language}" saying where the group as a whole stands. Each "bands" entry echoes a band key you were given and holds 1-2 sentences in language "${language}" about THAT band's answers only: name their shared theme concretely, and for a weaker band say plainly why it is weaker (few raters, or a split room) without scolding anyone. Neutral, concrete, never invents an answer nobody gave, never crowns a band as the winner.`,
			user: prompt,
			maxTokens: 700,
			temperature: 0.3,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(raw)) as {
			summary?: unknown;
			bands?: unknown;
		};

		const byBand = new Map<string, string>();
		if (Array.isArray(parsed.bands)) {
			parsed.bands.forEach((entry) => {
				const row = entry as { band?: unknown; text?: unknown };
				if (typeof row.band === 'string' && typeof row.text === 'string' && row.text.trim()) {
					byBand.set(row.band, row.text.trim());
				}
			});
		}

		return {
			summary:
				typeof parsed.summary === 'string' && parsed.summary.trim()
					? parsed.summary.trim()
					: fixture.summary,
			// The bands themselves are ours — the model only supplies their prose,
			// so a hallucinated or missing band cannot change what was carried.
			bands: skeleton.map((band) => ({ ...band, text: byBand.get(band.band) ?? band.text })),
		};
	} catch (error) {
		logError(error, { operation: 'agora.questionStage.summarise' });

		return fixture;
	}
}

/**
 * Close a question item: rank its answers, apply the cutoff, write the AI
 * record (overall line + one line per C_p band), and stamp the outcome onto
 * `stageState[itemId]`. Also marks the selected answers `isChosen` and
 * writes `results` on the question
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
			.filter((statement) => statement.parentId === item.statementId && !isAgoraHidden(statement));

		const rows = rankCarriedAnswers(answers.map((statement) => toCarriedAnswer(statement, named)));
		const selected = selectCarriedAnswers(rows, resolveQuestionSelection(item));

		const topicSnap = await db
			.collection(Collections.agoraTopicPackages)
			.doc(session.topicPackageId)
			.get();
		const language = (topicSnap.data() as AgoraTopicPackage | undefined)?.language ?? 'he';
		const { summary, bands } = await summariseAnswers(item.title ?? '', selected, language);

		const outcome = {
			selected,
			...(summary ? { summary } : {}),
			...(bands.length > 0 ? { bands } : {}),
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
