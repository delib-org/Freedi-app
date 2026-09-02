import {
	Collections,
	ParagraphType,
	SourceApp,
	Statement,
	StatementType,
	StudioDraftCutoff,
	User,
	createParagraphChildStatement,
} from '@freedi/shared-types';
import { array, object, optional, parse, string } from 'valibot';
import { db } from '../../db';
import { TAXONOMY_MODEL, callLLM, extractJson } from '../../config/openai-chat';
import { detectLanguage, dominantLanguage } from '../../services/topic-cluster/language';
import { languageName } from './planSession';

/**
 * The Draft tool: turn the top suggestions under one or more source questions
 * into a proposal document for Sign — sections and paragraphs with provenance,
 * plus an explicit "open questions" section for what the suggestions do not
 * settle. Admins review and edit freely in Sign before opening for comment.
 */

const DRAFT_MODEL = process.env.OPENAI_STUDIO_DRAFT_MODEL || TAXONOMY_MODEL;
const MAX_SUGGESTIONS = 60;
const SUGGESTION_MAX_CHARS = 600;

export interface DraftSuggestion {
	statementId: string;
	sourceId: string;
	text: string;
	consensus: number;
	numberOfEvaluators: number;
}

export interface DraftSource {
	statement: Statement;
	suggestions: DraftSuggestion[];
}

export interface DraftParagraph {
	text: string;
	sourceIds: string[];
}

export interface DraftSection {
	heading: string;
	paragraphs: DraftParagraph[];
}

export interface DraftDocument {
	title: string;
	sections: DraftSection[];
	openGaps: DraftParagraph[];
}

/** Provenance stored on every AI-written paragraph (survives Sign's field-level edits). */
export interface DraftProvenance {
	draftRunId: string;
	sources: Array<{ statementId: string; consensus: number; numberOfEvaluators: number }>;
}

function isCandidate(s: Statement): boolean {
	return (
		s.hide !== true && s.statementType !== StatementType.paragraph && s.integratedInto === undefined
	);
}

function toSuggestion(s: Statement, sourceId: string): DraftSuggestion {
	return {
		statementId: s.statementId,
		sourceId,
		text: s.statement.trim().slice(0, SUGGESTION_MAX_CHARS),
		consensus: typeof s.consensus === 'number' ? s.consensus : 0,
		numberOfEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
	};
}

export function applyCutoff(
	suggestions: DraftSuggestion[],
	cutoff: StudioDraftCutoff,
	chosenIds: ReadonlySet<string>,
): DraftSuggestion[] {
	const minEvaluators = cutoff.minEvaluators ?? 0;
	const eligible = suggestions.filter((s) => s.numberOfEvaluators >= minEvaluators);
	const byConsensus = [...eligible].sort(
		(a, b) => b.consensus - a.consensus || b.numberOfEvaluators - a.numberOfEvaluators,
	);
	if (cutoff.mode === 'chosen') {
		const chosen = byConsensus.filter((s) => chosenIds.has(s.statementId));
		if (chosen.length > 0) return chosen.slice(0, MAX_SUGGESTIONS);
	}
	if (cutoff.mode === 'threshold') {
		const min = cutoff.minConsensus ?? 0.3;

		return byConsensus.filter((s) => s.consensus >= min).slice(0, MAX_SUGGESTIONS);
	}
	const n = cutoff.n && cutoff.n > 0 ? Math.min(cutoff.n, MAX_SUGGESTIONS) : 20;

	return byConsensus.slice(0, n);
}

export async function loadDraftSources(
	sourceIds: string[],
	cutoff: StudioDraftCutoff,
): Promise<DraftSource[]> {
	const sources: DraftSource[] = [];
	for (const sourceId of sourceIds) {
		const snap = await db.collection(Collections.statements).doc(sourceId).get();
		if (!snap.exists) continue;
		const statement = snap.data() as Statement;
		const children = await db
			.collection(Collections.statements)
			.where('parentId', '==', sourceId)
			.where('statementType', '==', StatementType.option)
			.get();
		const candidates = children.docs.map((d) => d.data() as Statement).filter(isCandidate);
		const chosenIds = new Set(
			candidates.filter((c) => c.isChosen === true).map((c) => c.statementId),
		);
		const suggestions = applyCutoff(
			candidates.map((c) => toSuggestion(c, sourceId)),
			cutoff,
			chosenIds,
		);
		sources.push({ statement, suggestions });
	}

	return sources;
}

export function draftLanguage(sources: DraftSource[], fallback: string): string {
	const codes = sources.flatMap((s) => s.suggestions.map((x) => detectLanguage(x.text)));
	const dominant = codes.length > 0 ? dominantLanguage(codes) : 'und';

	return dominant === 'und' ? fallback : dominant;
}

function renderSources(sources: DraftSource[]): string {
	return sources
		.map((source) => {
			const lines = source.suggestions.map(
				(s) =>
					`[id=${s.statementId} | consensus=${s.consensus.toFixed(2)} | raters=${s.numberOfEvaluators}] ${s.text}`,
			);

			return `### Question: ${source.statement.statement}\n${lines.join('\n')}`;
		})
		.join('\n\n');
}

export function buildDraftPrompt(input: {
	sources: DraftSource[];
	topQuestion: string;
	intent?: string;
	languageCode: string;
}): { system: string; user: string } {
	const lang = languageName(input.languageCode);
	const system = `You write the DRAFT of an agreement for a community, from the suggestions its members made and rated. The draft goes to an administrator for review and then to the whole public for paragraph-by-paragraph comment in a document tool.

Write everything in ${lang}.

Rules:
- Propose what should be DONE, in the community's own terms. Do not summarize "what people said".
- Weight suggestions by consensus and number of raters; the strongest ones shape the structure.
- NEVER WIDEN SCOPE and NEVER ADD COMMITMENTS: no facts, numbers, beneficiaries, deadlines, mechanisms or conditions that no suggestion stated. Where suggestions do not say HOW, leave it open.
- EVERY SUGGESTION MUST REMAIN VISIBLE: each included suggestion's concrete ask must be recognizable in some paragraph, and that paragraph lists its id in sourceIds. Keep the more concrete wording when two say the same thing.
- Where strong suggestions CONTRADICT each other, or the consensus is thin, do NOT invent a compromise: put it in openGaps as a clear question, citing the ids on each side.
- Structure: 2–6 sections with short headings; 1–4 paragraphs per section, 40–120 words each; one idea per paragraph so people can comment precisely.

Return ONLY JSON:
{
  "title": string,
  "sections": [{ "heading": string, "paragraphs": [{ "text": string, "sourceIds": string[] }] }],
  "openGaps": [{ "text": string, "sourceIds": string[] }]
}`;
	const user = `Main question: ${input.topQuestion}
${input.intent ? `What the administrator wants this draft to be: ${input.intent}\n` : ''}
SOURCE SUGGESTIONS (verified community input, with consensus 0..1 and rater counts):

${renderSources(input.sources)}`;

	return { system, user };
}

const ParagraphSchema = object({ text: string(), sourceIds: optional(array(string())) });
const DraftSchema = object({
	title: string(),
	sections: array(object({ heading: string(), paragraphs: array(ParagraphSchema) })),
	openGaps: optional(array(ParagraphSchema)),
});

/** Validates the model output and drops source ids that are not real inputs. */
export function parseDraft(raw: unknown, sources: DraftSource[]): DraftDocument {
	const known = new Set(sources.flatMap((s) => s.suggestions.map((x) => x.statementId)));
	const parsed = parse(DraftSchema, raw);
	const clean = (p: { text: string; sourceIds?: string[] }): DraftParagraph => ({
		text: p.text.trim(),
		sourceIds: (p.sourceIds ?? []).filter((id) => known.has(id)),
	});
	const sections = parsed.sections
		.map((s) => ({
			heading: s.heading.trim(),
			paragraphs: s.paragraphs.map(clean).filter((p) => p.text.length > 0),
		}))
		.filter((s) => s.heading && s.paragraphs.length > 0);
	if (sections.length === 0) throw new Error('The draft has no sections');

	return {
		title: parsed.title.trim(),
		sections,
		openGaps: (parsed.openGaps ?? []).map(clean).filter((p) => p.text.length > 0),
	};
}

/** Deterministic draft for emulators/CI: one section per source, one paragraph per suggestion. */
export function fixtureDraft(sources: DraftSource[], topQuestion: string): DraftDocument {
	return {
		title: topQuestion,
		sections: sources.map((source) => ({
			heading: source.statement.statement,
			paragraphs: source.suggestions.map((s) => ({ text: s.text, sourceIds: [s.statementId] })),
		})),
		openGaps: [],
	};
}

export async function generateDraft(input: {
	sources: DraftSource[];
	topQuestion: string;
	intent?: string;
	languageCode: string;
}): Promise<DraftDocument> {
	if (!process.env.OPENAI_API_KEY) return fixtureDraft(input.sources, input.topQuestion);
	const { system, user } = buildDraftPrompt(input);
	const raw = await callLLM({
		model: DRAFT_MODEL,
		system,
		user,
		maxTokens: 6000,
		temperature: 0.4,
		jsonMode: true,
	});

	return parseDraft(JSON.parse(extractJson(raw)) as unknown, input.sources);
}

const OPEN_GAPS_HEADING: Record<string, string> = {
	he: 'שאלות פתוחות',
	en: 'Open questions',
	ar: 'أسئلة مفتوحة',
};

/**
 * Writes the draft as official Sign paragraphs under the document. Earlier
 * AI-written paragraphs (any `draftProvenance`) are hidden, human-written
 * ones are kept and pushed after the new text.
 */
export async function writeDraftParagraphs(input: {
	document: Statement;
	draft: DraftDocument;
	sources: DraftSource[];
	creator: User;
	runId: string;
	languageCode: string;
	now: number;
}): Promise<{ paragraphCount: number; openGaps: number }> {
	const { document, draft, sources, creator, runId, languageCode, now } = input;
	const byId = new Map(
		sources.flatMap((s) => s.suggestions.map((x) => [x.statementId, x] as const)),
	);
	const existingSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', document.statementId)
		.where('statementType', '==', StatementType.paragraph)
		.get();
	const existing = existingSnap.docs
		.map((d) => d.data() as Statement)
		.filter((p) => p.hide !== true);
	const previousAi = existing.filter((p) => (p as { draftProvenance?: unknown }).draftProvenance);
	const human = existing.filter((p) => !(p as { draftProvenance?: unknown }).draftProvenance);

	const host = { statementId: document.statementId, topParentId: document.statementId };
	const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
	let order = 0;
	const push = (content: string, blockType: ParagraphType, paragraph?: DraftParagraph): void => {
		const statement = createParagraphChildStatement({
			content,
			host,
			creator,
			order: order++,
			blockType,
			sourceApp: SourceApp.SIGN,
			isOfficial: true,
			sourceStatementId: paragraph?.sourceIds[0],
		});
		if (!statement) throw new Error('Failed to build a draft paragraph');
		statement.consensus = 1.0;
		const provenance: DraftProvenance = {
			draftRunId: runId,
			sources: (paragraph?.sourceIds ?? [])
				.map((id) => byId.get(id))
				.filter((s): s is DraftSuggestion => !!s)
				.map((s) => ({
					statementId: s.statementId,
					consensus: s.consensus,
					numberOfEvaluators: s.numberOfEvaluators,
				})),
		};
		writes.push({ id: statement.statementId, data: { ...statement, draftProvenance: provenance } });
	};

	let paragraphCount = 0;
	draft.sections.forEach((section) => {
		push(section.heading, ParagraphType.h2);
		section.paragraphs.forEach((p) => {
			push(p.text, ParagraphType.paragraph, p);
			paragraphCount++;
		});
	});
	if (draft.openGaps.length > 0) {
		push(OPEN_GAPS_HEADING[languageCode] ?? OPEN_GAPS_HEADING.en, ParagraphType.h2);
		draft.openGaps.forEach((gap) => push(gap.text, ParagraphType.li, gap));
	}

	let batch = db.batch();
	let pending = 0;
	const flush = async (): Promise<void> => {
		if (pending === 0) return;
		await batch.commit();
		batch = db.batch();
		pending = 0;
	};
	for (const w of writes) {
		batch.set(db.collection(Collections.statements).doc(w.id), w.data);
		if (++pending >= 400) await flush();
	}
	for (const p of previousAi) {
		batch.update(db.collection(Collections.statements).doc(p.statementId), {
			hide: true,
			lastUpdate: now,
		});
		if (++pending >= 400) await flush();
	}
	// Human-written paragraphs keep their relative order after the new draft.
	[...human]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.forEach((p) => {
			batch.update(db.collection(Collections.statements).doc(p.statementId), {
				order: order,
				'doc.order': order,
				lastUpdate: now,
			});
			order++;
			pending++;
		});
	await flush();

	await db
		.collection(Collections.statements)
		.doc(document.statementId)
		.update({
			statement: draft.title || document.statement,
			lastDraftRunId: runId,
			lastUpdate: now,
		});

	return { paragraphCount, openGaps: draft.openGaps.length };
}
