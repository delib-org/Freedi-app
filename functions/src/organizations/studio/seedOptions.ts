import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
	Collections,
	SourceApp,
	Statement,
	StatementType,
	STUDIO_SEED_OPTIONS_COUNT,
	STUDIO_SEED_OPTION_MAX_CHARS,
	User,
	createStatementObject,
} from '@freedi/shared-types';
import { array, object, parse, string } from 'valibot';
import { db } from '../../db';
import { TAXONOMY_MODEL, callLLM, extractJson } from '../../config/openai-chat';
import { languageName } from './planSession';

/**
 * Starting suggestions for a crowd survey: the first participants must have
 * something to rate, so every survey built from a plan is seeded with a few
 * concrete proposals (written by the consultant into the plan, or generated
 * on demand for a survey created by hand). Seeds are ordinary options —
 * same shape as MC's own submit route — minus the author's automatic +1.
 */

const SEED_MODEL = process.env.OPENAI_STUDIO_DRAFT_MODEL || TAXONOMY_MODEL;
/** Marker on seeded options (outside the Statement schema; Admin SDK writes). */
export const SEEDED_BY = 'studio-ai';

export function cleanSeedOptions(raw: readonly string[] | undefined, max = 8): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of raw ?? []) {
		const text = item.replace(/\s+/g, ' ').trim().slice(0, STUDIO_SEED_OPTION_MAX_CHARS);
		const key = text.toLowerCase();
		if (text.length < 3 || seen.has(key)) continue;
		seen.add(key);
		out.push(text);
		if (out.length >= max) break;
	}

	return out;
}

export function buildSeedOption(input: {
	statementId: string;
	question: Statement;
	text: string;
	creator: User;
	index: number;
}): Statement {
	const { statementId, question, text, creator, index } = input;
	const topParentId =
		question.parentId === 'top'
			? question.statementId
			: question.topParentId || question.statementId;
	const option = createStatementObject({
		statementId,
		statement: text,
		statementType: StatementType.option,
		parentId: question.statementId,
		topParentId,
		parents: [...(question.parents ?? []), question.statementId],
		creatorId: creator.uid,
		creator,
		sourceApp: SourceApp.MASS_CONSENSUS,
	});
	if (!option) throw new Error('Failed to build a seed option');
	option.order = index;
	const marked = option as Statement & { seededBy: string };
	marked.seededBy = SEEDED_BY;

	return marked;
}

/** Batch writes: the options + the question's counters (as MC's submit route does). */
export function seedOptionWrites(
	options: Statement[],
	questionId: string,
	now: number,
): Array<(batch: WriteBatch) => void> {
	if (options.length === 0) return [];
	const writes: Array<(batch: WriteBatch) => void> = options.map(
		(option) => (batch) =>
			batch.set(db.collection(Collections.statements).doc(option.statementId), option),
	);
	writes.push((batch) =>
		batch.update(db.collection(Collections.statements).doc(questionId), {
			suggestions: FieldValue.increment(options.length),
			numberOfOptions: FieldValue.increment(options.length),
			lastUpdate: now,
		}),
	);

	return writes;
}

const SeedSchema = object({ options: array(string()) });

function fixtureSeeds(question: string, count: number): string[] {
	return Array.from({ length: count }, (_, i) => `Suggestion ${i + 1} for: ${question}`);
}

/** Writes `count` starting suggestions for a question (LLM, or fixture without a key). */
export async function generateSeedOptions(input: {
	question: Statement;
	topQuestion?: string;
	languageCode: string;
	count?: number;
	intent?: string;
	existing?: string[];
}): Promise<string[]> {
	const count = input.count ?? STUDIO_SEED_OPTIONS_COUNT;
	if (!process.env.OPENAI_API_KEY) return fixtureSeeds(input.question.statement, count);
	const system = `You seed a public crowd survey with its first suggestions so early participants have something to rate. Write ${count} suggestions in ${languageName(input.languageCode)}, each as a participant would write it: one concrete proposal per suggestion, 8–30 words, first person plural or imperative, no numbering, no headings. Make them DIVERSE — different levers, different trade-offs, some modest and some bold — and neutral in tone so no side feels the survey is rigged. Never repeat an existing suggestion. Return ONLY JSON: {"options": string[]}`;
	const user = `Survey question: ${input.question.statement}
${input.question.description ? `Explanation: ${input.question.description}\n` : ''}${input.topQuestion ? `Main question of the process: ${input.topQuestion}\n` : ''}${input.intent ? `What the administrator wants: ${input.intent}\n` : ''}${
		input.existing && input.existing.length > 0
			? `Existing suggestions (do not repeat):\n- ${input.existing.join('\n- ')}`
			: ''
	}`;
	const raw = await callLLM({
		model: SEED_MODEL,
		system,
		user,
		maxTokens: 1200,
		temperature: 0.7,
		jsonMode: true,
	});
	const parsed = parse(SeedSchema, JSON.parse(extractJson(raw)) as unknown);

	return cleanSeedOptions(parsed.options, count);
}

/** Existing non-hidden options under a question (to avoid duplicates / detect an already-seeded survey). */
export async function loadExistingOptions(questionId: string): Promise<Statement[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();

	return snap.docs.map((d) => d.data() as Statement).filter((s) => s.hide !== true);
}
