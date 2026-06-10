/**
 * `evidenceScorerV1` (§5a) — the swappable AI `EvidenceScorer`. Builds a
 * structured Gemini prompt classifying an evidence reply w.r.t. its parent, then
 * maps the result through the taxonomy + authority rule (§3).
 *
 * `score()` returns the AI classification with `independenceFactor`/
 * `effectiveWeight` defaulted to 1; the trigger (`fn_onChatStatementCreated`)
 * recomputes independence against siblings and patches those two fields.
 *
 * Registers itself on import via `registerScorer()`.
 */
import {
	registerScorer,
	createTaxonomy,
	type EvidenceScorer,
	type EvidenceVerdict,
	type EvidenceRelation,
	type ScoreInput,
} from '@freedi/evidence';
import { getGenAI } from '../config/gemini';

const taxonomy = createTaxonomy();
export const SCORER_VERSION = `scorer-v1-gemini-${taxonomy.version}`;

/** Confidence threshold below which the user's pill wins direction (§3). */
const TAU_CONF = 0.5;

function pillToRelation(pill: string): EvidenceRelation {
	if (pill === 'critique') return 'falsify';
	if (pill === 'strengthen') return 'corroborate';

	return 'neutral';
}

interface RawVerdict {
	relation?: string;
	evidenceClass?: string;
	confidence?: number;
	rationale?: string;
	features?: Record<string, unknown>;
}

function buildPrompt(input: ScoreInput): string {
	const classes = Object.entries(taxonomy.raw.classes)
		.map(([k, v]) => `  - ${k}: ${v.label}`)
		.join('\n');

	return `You are an evidence-classification engine for a dialectical debate platform.
Classify how the REPLY relates to its PARENT claim. Respond with STRICT JSON only.

PARENT CLAIM:
"""${input.parentText}"""

REPLY (the user marked it as "${input.userPillHint}"):
"""${input.statementText}"""
${input.threadContext ? `\nTHREAD CONTEXT:\n"""${input.threadContext}"""\n` : ''}
Return JSON with exactly these keys:
{
  "relation": one of "corroborate" | "falsify" | "neutral",
  "evidenceClass": one of:
${classes}
  "confidence": number in [0,1] — your confidence in this classification,
  "rationale": one concise sentence explaining the classification,
  "features": object with any signals you used (e.g. {"citesSource": true})
}

Rules:
- "corroborate" means the reply supports/strengthens the parent claim.
- "falsify" means it undercuts/critiques the parent claim.
- "neutral" means it neither clearly supports nor undercuts.
- Judge the evidence itself, not the user's label.
- Be skeptical of unsupported anecdotes; reserve high classes for real studies.`;
}

export const evidenceScorerV1: EvidenceScorer = {
	version: SCORER_VERSION,
	async score(input: ScoreInput): Promise<EvidenceVerdict> {
		const model = getGenAI().getGenerativeModel({
			model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
			generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
		});

		const result = await model.generateContent(buildPrompt(input));
		const text = result.response.text();
		const raw = parseJson(text);
		if (!raw) throw new Error('Scorer returned unparseable JSON');

		const aiRelation = (['corroborate', 'falsify', 'neutral'] as const).includes(
			raw.relation as EvidenceRelation,
		)
			? (raw.relation as EvidenceRelation)
			: 'neutral';
		const aiClass = taxonomy.has(raw.evidenceClass ?? '') ? (raw.evidenceClass as string) : '';
		const confidence = clamp01(typeof raw.confidence === 'number' ? raw.confidence : 0.5);

		// Authority rule (§3): low confidence ⇒ pill wins direction + fallback strength.
		const lowConfidence = confidence < TAU_CONF;
		const relation = lowConfidence ? pillToRelation(input.userPillHint) : aiRelation;
		const evidenceClass = lowConfidence || !aiClass ? '' : aiClass;
		const baseStrength = evidenceClass
			? taxonomy.lookup(evidenceClass)
			: taxonomy.fallbackForPill(input.userPillHint);

		return {
			relation,
			evidenceClass: evidenceClass || `pill:${input.userPillHint}`,
			baseStrength,
			confidence,
			independenceFactor: 1, // patched by the trigger against siblings
			effectiveWeight: 1,
			rationale: raw.rationale ?? '',
			source: 'ai',
			...(lowConfidence ? { lowConfidence: true } : {}),
			features: raw.features ?? {},
		};
	},
};

function clamp01(x: number): number {
	if (Number.isNaN(x)) return 0;

	return x < 0 ? 0 : x > 1 ? 1 : x;
}

function parseJson(text: string): RawVerdict | null {
	try {
		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start === -1 || end <= start) return null;

		return JSON.parse(text.slice(start, end + 1)) as RawVerdict;
	} catch {
		return null;
	}
}

registerScorer(evidenceScorerV1);

