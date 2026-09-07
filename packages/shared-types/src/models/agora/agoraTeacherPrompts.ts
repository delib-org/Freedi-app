import { number, object, optional, record, string, InferOutput } from 'valibot';
import type { AgoraQuestionKind } from './rounds';
import type { AgoraStagePlanItem } from './stagePlan';

/**
 * A teacher's own wording for the WizCol rounds.
 *
 * The rounds ship with a prompt per kind (`AGORA_ROUNDS` + the `round.*.prompt`
 * strings), and a plan item leaves title/explanation blank to take it. But a
 * class that does not understand "what matters to you here?" needs the words
 * changed, and usually needs them changed for good — the same round comes
 * round again next lesson.
 *
 * So when a teacher rewords a round and says "for all my rounds like this",
 * the wording is kept HERE, one doc per teacher keyed by their uid, and
 * `applyTeacherPrompts` stamps it onto the round items of every plan they
 * start afterwards. Only blank items are filled: wording typed for one
 * specific game always beats the standing default.
 *
 * Written by `agoraRewordQuestion` alone; a teacher reads their own doc and
 * nobody else's.
 */

export const AgoraQuestionWordingSchema = object({
	/** The question as the room reads it; blank means "keep the kind's own prompt" */
	title: string(),
	/** The sentence under it */
	explanation: string(),
	updatedAt: number(),
});

export type AgoraQuestionWording = InferOutput<typeof AgoraQuestionWordingSchema>;

/** Question kind → the teacher's wording. `open` is never stored: it has no shared prompt. */
export type AgoraTeacherPromptMap = Partial<Record<AgoraQuestionKind, AgoraQuestionWording>>;

export const AgoraTeacherPromptsSchema = object({
	/** Doc id — the teacher's uid */
	teacherId: string(),
	/**
	 * Keyed by `AgoraQuestionKind`. Typed as a plain record because the map is
	 * partial by nature — a teacher rewords one round at a time — and readers
	 * take it as `AgoraTeacherPromptMap`.
	 */
	prompts: optional(record(string(), AgoraQuestionWordingSchema)),
	lastUpdate: number(),
});

export type AgoraTeacherPrompts = InferOutput<typeof AgoraTeacherPromptsSchema>;

/**
 * Stamp a teacher's standing wording onto the round items of a plan.
 *
 * Blank fields only, and title and explanation are considered one at a time —
 * a teacher who reworded the question but left the hint alone keeps the
 * book's hint. Returns a new array; items of kind `open` are never touched,
 * they have no default to fall back to.
 */
export function applyTeacherPrompts<T extends AgoraStagePlanItem>(
	plan: readonly T[],
	prompts: AgoraTeacherPromptMap | undefined,
): T[] {
	if (!prompts) return [...plan];

	return plan.map((item) => {
		const kind = item.kind;
		if (!kind || kind === 'open') return item;
		const wording = prompts[kind];
		if (!wording) return item;
		const title = (item.title ?? '').trim() || wording.title.trim();
		const explanation = (item.explanation ?? '').trim() || wording.explanation.trim();
		if (title === (item.title ?? '') && explanation === (item.explanation ?? '')) return item;

		return { ...item, title, explanation };
	});
}
