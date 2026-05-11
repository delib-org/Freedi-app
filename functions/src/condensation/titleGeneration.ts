import { callGemini, extractJSON } from '../ai/callGemini';
import { logError } from '../utils/errorHandling';

interface TitleResult {
	title: string;
	description: string;
}

/**
 * Ask Gemini to produce a condensed title + description that represents the
 * group of similar suggestions. The prompt intentionally avoids "merging"
 * language because originals are preserved — the condensed suggestion is a
 * NEW representation of the shared idea, not a replacement for any original.
 *
 * Falls back to the longest source text (truncated) if Gemini fails. The
 * creator can always edit the title/description via the curation page.
 */
export async function generateGroupedTitle(
	sourceTexts: string[],
	questionContext: string,
): Promise<TitleResult> {
	const fallback: TitleResult = {
		title: (sourceTexts[0] ?? 'Grouped suggestion').slice(0, 120),
		description: sourceTexts.slice(1).join(' · ').slice(0, 240),
	};

	if (sourceTexts.length === 0) return fallback;

	try {
		const systemPrompt = [
			'You are helping a civic-deliberation platform group semantically similar',
			'user suggestions into a single "condensed" representative suggestion.',
			'The originals are preserved — you are NOT merging or rewriting them. You',
			'are producing a short, neutral label that voters can recognize as',
			'representing all of them. Do not invent content that is not present in',
			"the sources. Match the sources' language (Hebrew, Arabic, English,",
			'Spanish, etc.) — do not translate.',
			'',
			'Return strict JSON: { "title": string, "description": string }.',
			'Title: ≤ 80 characters, no quotes, no trailing punctuation.',
			'Description: ≤ 200 characters, one sentence, neutral tone.',
		].join('\n');

		const userPrompt = [
			`Question context: ${questionContext}`,
			'',
			'Similar user suggestions to represent:',
			...sourceTexts.map((t, i) => `${i + 1}. ${t}`),
		].join('\n');

		const response = await callGemini(systemPrompt, userPrompt, { temperature: 0.2 });
		const parsed = extractJSON<TitleResult>(response, fallback);
		if (!parsed?.title) return fallback;

		return {
			title: String(parsed.title).slice(0, 120),
			description: String(parsed.description ?? '').slice(0, 240),
		};
	} catch (error) {
		logError(error, {
			operation: 'condensation.titleGeneration.generateGroupedTitle',
			metadata: { sourceCount: sourceTexts.length },
		});

		return fallback;
	}
}
