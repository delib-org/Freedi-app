/**
 * Client for the `improveSuggestion` Cloud Function's comment-driven mode:
 * the suggestion author asks AI to redraft their suggestion from the comments
 * they marked helpful. The function is a plain HTTP endpoint (not a callable),
 * mirroring the main app's `src/services/suggestionImprovement.ts` wiring.
 */

import { Statement } from '@freedi/shared-types';

const FUNCTIONS_REGION = 'me-west1';
const REQUEST_TIMEOUT_MS = 45000;

export interface ImprovePayload {
	title: string;
	description?: string;
	parentTitle?: string;
	parentDescription?: string;
	comments: { content: string }[];
}

export interface ImproveResult {
	improvedTitle: string;
	improvedDescription?: string;
	detectedLanguage?: string;
}

/**
 * Flatten one chat message back to plain text: the title line plus any
 * paragraph lines. Multi-paragraph messages store their body in `description`
 * joined with ' | ' (regenerated server-side from the paragraph children) —
 * same convention ChatMessage uses to render them.
 */
export function messageToCommentContent(message: Statement): string {
	const body = message.description ? message.description.split(' | ').map((s) => s.trim()) : [];

	return [message.statement ?? '', ...body].filter((s) => s.length > 0).join('\n');
}

/**
 * Build the request body for the comment-driven improvement call. The
 * suggestion's paragraph children become the `description` (newline-joined);
 * the question provides parent context so the AI keeps the redraft on-topic.
 */
export function buildImprovePayload(
	option: Statement,
	paragraphs: Statement[] | null,
	question: Statement | null,
	helpfulMessages: Statement[],
): ImprovePayload {
	const body = (paragraphs ?? []).map((p) => p.statement ?? '').filter((s) => s.trim().length > 0);

	return {
		title: option.statement ?? '',
		description: body.length > 0 ? body.join('\n') : undefined,
		parentTitle: question?.statement || undefined,
		parentDescription: question?.description || undefined,
		comments: helpfulMessages
			.map((msg) => ({ content: messageToCommentContent(msg) }))
			.filter((c) => c.content.length > 0),
	};
}

/**
 * Compose the AI result into the textarea shape `updateSuggestion` parses
 * back: first line is the title, each following line becomes a paragraph
 * child.
 */
export function composeDraftText(improvedTitle: string, improvedDescription?: string): string {
	const lines = [improvedTitle, ...(improvedDescription ?? '').split('\n')]
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	return lines.join('\n');
}

function getEndpoint(): string {
	const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
	if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
		return `http://localhost:5001/${projectId}/${FUNCTIONS_REGION}/improveSuggestion`;
	}

	return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/improveSuggestion`;
}

/** POST the payload to the function, racing a 45s timeout. */
export async function requestImprovedDraft(payload: ImprovePayload): Promise<ImproveResult> {
	const request = (async () => {
		const response = await fetch(getEndpoint(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`improveSuggestion failed: HTTP ${response.status}`);
		}

		const result = (await response.json()) as ImproveResult;
		if (!result.improvedTitle || typeof result.improvedTitle !== 'string') {
			throw new Error('improveSuggestion returned no improvedTitle');
		}

		return result;
	})();

	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('improveSuggestion timed out')), REQUEST_TIMEOUT_MS);
	});

	return Promise.race([request, timeout]);
}
