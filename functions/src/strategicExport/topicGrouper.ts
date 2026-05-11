/**
 * Strategic export — group aggregated suggestions into topics via Gemini.
 *
 * Input: a list of aggregated-suggestion display names. Output: a topic
 * grouping where each topic gets a name, a one-sentence summary, and a list
 * of aggregateIds belonging to it.
 */

import { logger } from 'firebase-functions';
import { getGenAI, GEMINI_MODEL } from '../config/gemini';

interface NamedAggregate {
	aggregateId: string;
	name: string;
}

export interface TopicGrouping {
	topicId: string;
	topicName: string;
	topicSummary?: string;
	aggregateIds: string[];
}

/** Fallback grouping when LLM is unavailable: a single "All suggestions" topic. */
function fallbackSingleTopic(items: NamedAggregate[]): TopicGrouping[] {
	if (items.length === 0) return [];

	return [
		{
			topicId: 'topic-uncategorized',
			topicName: 'All suggestions',
			topicSummary: 'Topic grouping unavailable; suggestions are listed flat.',
			aggregateIds: items.map((i) => i.aggregateId),
		},
	];
}

/**
 * Group aggregates into topics using a single Gemini call. Returns a fallback
 * single-topic grouping on any failure (so the export never fails because of
 * the LLM).
 */
export async function groupAggregatesIntoTopics(
	questionText: string,
	aggregates: NamedAggregate[],
): Promise<TopicGrouping[]> {
	if (aggregates.length === 0) return [];
	if (aggregates.length === 1) {
		return [
			{
				topicId: 'topic-1',
				topicName: aggregates[0].name,
				aggregateIds: [aggregates[0].aggregateId],
			},
		];
	}

	try {
		const genAI = getGenAI();
		const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = buildPrompt(questionText, aggregates);
		const response = await model.generateContent(prompt);
		const text = response.response.text();

		const parsed = parseTopicJson(text);
		if (!parsed || parsed.length === 0) {
			logger.warn('strategicExport.topicGrouper: empty LLM result, using fallback');

			return fallbackSingleTopic(aggregates);
		}

		const stamped: TopicGrouping[] = parsed.map((t, idx) => ({
			topicId: `topic-${idx + 1}`,
			topicName: t.topicName,
			topicSummary: t.topicSummary,
			aggregateIds: t.aggregateIds,
		}));

		return reconcileMissingIds(stamped, aggregates);
	} catch (error) {
		logger.warn('strategicExport.topicGrouper failed, using fallback', {
			error: error instanceof Error ? error.message : String(error),
		});

		return fallbackSingleTopic(aggregates);
	}
}

function buildPrompt(questionText: string, aggregates: NamedAggregate[]): string {
	const list = aggregates.map((a) => `- ${a.aggregateId}: ${a.name}`).join('\n');

	return `You are organizing a strategic report for decision makers.

The deliberation question was:
"${questionText}"

Below are aggregated suggestions (each ID followed by a short label). Group them into 2-7 high-level topics that capture the major themes, in the same primary language as the suggestions. Every aggregate ID must appear in exactly one topic.

Return ONLY a JSON array, no prose, with this shape:
[
  {
    "topicName": "Short topic title",
    "topicSummary": "One-sentence summary of what this topic covers.",
    "aggregateIds": ["id1", "id2"]
  }
]

Aggregates:
${list}`;
}

interface ParsedTopic {
	topicName: string;
	topicSummary?: string;
	aggregateIds: string[];
}

function parseTopicJson(text: string): ParsedTopic[] | null {
	try {
		let cleaned = text
			.replace(/```json/gi, '')
			.replace(/```/g, '')
			.trim();
		// Strip leading/trailing prose around the JSON array if present.
		const start = cleaned.indexOf('[');
		const end = cleaned.lastIndexOf(']');
		if (start !== -1 && end !== -1 && end > start) {
			cleaned = cleaned.slice(start, end + 1);
		}
		const parsed = JSON.parse(cleaned) as unknown;
		if (!Array.isArray(parsed)) return null;
		const result: ParsedTopic[] = [];
		for (const t of parsed) {
			if (typeof t !== 'object' || t === null) continue;
			const obj = t as Record<string, unknown>;
			if (typeof obj.topicName !== 'string') continue;
			if (!Array.isArray(obj.aggregateIds)) continue;
			const ids = obj.aggregateIds.filter((x): x is string => typeof x === 'string');
			if (ids.length === 0) continue;
			result.push({
				topicName: obj.topicName,
				topicSummary: typeof obj.topicSummary === 'string' ? obj.topicSummary : undefined,
				aggregateIds: ids,
			});
		}

		return result.length > 0 ? result : null;
	} catch {
		return null;
	}
}

/**
 * Ensure every aggregate appears in exactly one topic. Drop unknown IDs the
 * LLM may have hallucinated; bucket missing real IDs into a fallback topic.
 */
function reconcileMissingIds(
	topics: TopicGrouping[],
	aggregates: NamedAggregate[],
): TopicGrouping[] {
	const valid = new Set(aggregates.map((a) => a.aggregateId));
	const seen = new Set<string>();
	const cleaned: TopicGrouping[] = topics.map((t) => ({
		...t,
		aggregateIds: t.aggregateIds.filter((id) => {
			if (!valid.has(id)) return false;
			if (seen.has(id)) return false;
			seen.add(id);

			return true;
		}),
	}));

	const missing = aggregates.filter((a) => !seen.has(a.aggregateId));
	if (missing.length > 0) {
		cleaned.push({
			topicId: `topic-other`,
			topicName: 'Other',
			topicSummary: 'Suggestions that did not fit into the main topics.',
			aggregateIds: missing.map((m) => m.aggregateId),
		});
	}

	return cleaned.filter((t) => t.aggregateIds.length > 0);
}
