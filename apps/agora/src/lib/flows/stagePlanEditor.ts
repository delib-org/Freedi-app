/**
 * The stage plan editor's rules: what can be added where, what can move,
 * what is frozen. Pure — the component renders and dispatches, this decides.
 *
 * Two fixed ends (lobby first, results last), single instances of every
 * stage but `question` (a question item's KIND — open, or one of the WizCol
 * rounds — is a field on the row, not a stage of its own), and a frozen
 * prefix: once a game is running, the items up to and including the current
 * one are history and cannot change.
 */
import {
	AgoraStage,
	AGORA_CHARACTER_STAGES,
	AGORA_PLANNABLE_STAGES,
	AGORA_STAGE_PLAN,
	defaultQuestionSelection,
	defaultVotingTrigger,
	questionKindOf,
	stagePlanPreset,
	type AgoraQuestionKind,
	type AgoraStagePlanItem,
	type AgoraStagePlanPreset,
	type StagePlanError,
} from '@freedi/shared-types';

/** Every question type, in the order the teacher reads them */
export const QUESTION_KINDS: readonly AgoraQuestionKind[] = ['open', 'story', 'needs', 'vision'];

/**
 * What the "add a step" sheet can put in: a question of one type, or one of
 * the single-instance stages. A round is a QUESTION item with a kind — never
 * a stage of its own.
 */
export interface AddChoice {
	stage: AgoraStage;
	questionKind?: AgoraQuestionKind;
}

export type PlanEditorEvent =
	| {
			kind: 'add';
			stage: AgoraStage;
			/** A question's type; open when absent */
			questionKind?: AgoraQuestionKind;
			/** Where to splice it in; clamped into the insertable range, the end when absent */
			at?: number;
	  }
	| { kind: 'remove'; itemId: string }
	| { kind: 'move'; itemId: string; direction: -1 | 1 }
	| { kind: 'patch'; itemId: string; patch: Partial<Omit<AgoraStagePlanItem, 'itemId' | 'stage'>> }
	| { kind: 'preset'; preset: AgoraStagePlanPreset };

export interface PlanEditorOptions {
	hasCharacters: boolean;
	/** Items before this index are history — untouchable */
	frozenCount: number;
}

const FIXED: ReadonlySet<AgoraStage> = new Set([AgoraStage.lobby, AgoraStage.results]);

/** Which stages the "add" menu offers, given what is already in the plan */
export function addableStages(
	items: readonly AgoraStagePlanItem[],
	options: Pick<PlanEditorOptions, 'hasCharacters'>,
): AgoraStage[] {
	const present = new Set(items.map((item) => item.stage));

	return AGORA_PLANNABLE_STAGES.filter((stage) => {
		if (FIXED.has(stage)) return false;
		if (AGORA_CHARACTER_STAGES.has(stage) && !options.hasCharacters) return false;
		// Questions and linked stations come as many as the teacher wants
		if (stage === AgoraStage.question || stage === AgoraStage.linked) return true;

		return !present.has(stage);
	});
}

/**
 * Where a new step may be spliced in: after the entry and after the steps
 * that already ran, and never after the results. `first..last` inclusive, as
 * splice indices.
 */
export function insertionRange(
	items: readonly AgoraStagePlanItem[],
	frozenCount: number,
): { first: number; last: number } {
	const lobbyAt = items.findIndex((item) => item.stage === AgoraStage.lobby);
	const resultsAt = items.findIndex((item) => item.stage === AgoraStage.results);
	const last = resultsAt === -1 ? items.length : resultsAt;
	const first = Math.min(last, Math.max(Math.max(0, frozenCount), lobbyAt + 1));

	return { first, last };
}

/** Can a step be inserted at this splice index? */
export function canInsertAt(
	items: readonly AgoraStagePlanItem[],
	at: number,
	frozenCount: number,
): boolean {
	const { first, last } = insertionRange(items, frozenCount);

	return at >= first && at <= last;
}

/** The choices the add-step sheet offers: every question type, then what is not in the plan yet */
export function addChoices(
	items: readonly AgoraStagePlanItem[],
	options: Pick<PlanEditorOptions, 'hasCharacters'>,
): AddChoice[] {
	if (items.length >= AGORA_STAGE_PLAN.MAX_ITEMS) return [];

	return addableStages(items, options).flatMap((stage): AddChoice[] =>
		stage === AgoraStage.question
			? QUESTION_KINDS.map((questionKind) => ({ stage, questionKind }))
			: [{ stage }],
	);
}

/**
 * The problem a single step has, for the red edge and the sentence under its
 * title. The list-wide errors (duplicate ids, the fixed ends) stay in the
 * summary under the list; these are the ones a teacher fixes on the card.
 */
export function stepProblems(
	items: readonly AgoraStagePlanItem[],
	options: Pick<PlanEditorOptions, 'hasCharacters'>,
): Map<string, StagePlanError> {
	const problems = new Map<string, StagePlanError>();
	let sourceSeen = false;
	for (const item of items) {
		if (
			item.stage === AgoraStage.question &&
			questionKindOf(item) === 'open' &&
			!(item.title ?? '').trim()
		) {
			problems.set(item.itemId, 'question_needs_title');
		} else if (item.stage === AgoraStage.voting && !sourceSeen) {
			problems.set(item.itemId, 'voting_needs_source');
		} else if (AGORA_CHARACTER_STAGES.has(item.stage) && !options.hasCharacters) {
			problems.set(item.itemId, 'stage_needs_characters');
		} else if (item.stage === AgoraStage.linked && !item.link) {
			problems.set(item.itemId, 'linked_needs_link');
		}
		if (item.stage === AgoraStage.deliberation || item.stage === AgoraStage.question) {
			sourceSeen = true;
		}
	}

	return problems;
}

/** What a template is compared on: the steps, their types and their words */
function planSignature(items: readonly AgoraStagePlanItem[]): string {
	return JSON.stringify(
		items.map((item) => [
			item.stage,
			item.stage === AgoraStage.question ? questionKindOf(item) : '',
			(item.title ?? '').trim(),
			(item.explanation ?? '').trim(),
			item.link?.statementId ?? '',
		]),
	);
}

/**
 * The template the plan still is, if any. A teacher who has added, moved,
 * removed or typed anything has a plan of their own, and replacing it with a
 * template must ask first.
 */
export function matchingPreset(
	items: readonly AgoraStagePlanItem[],
	presets: readonly AgoraStagePlanPreset[],
	frozenCount = 0,
): AgoraStagePlanPreset | null {
	const mine = planSignature(items);

	return (
		presets.find(
			(preset) =>
				planSignature(
					planEditorReduce(
						items,
						{ kind: 'preset', preset },
						{
							hasCharacters: true,
							frozenCount,
						},
					),
				) === mine,
		) ?? null
	);
}

/** The item an `add` put in, by comparing ids before and after */
export function addedItem(
	before: readonly AgoraStagePlanItem[],
	after: readonly AgoraStagePlanItem[],
): AgoraStagePlanItem | null {
	const ids = new Set(before.map((item) => item.itemId));

	return after.find((item) => !ids.has(item.itemId)) ?? null;
}

/** A fresh id: the stage name for single-instance stages, numbered for questions and linked stations */
export function mintItemId(stage: AgoraStage, items: readonly AgoraStagePlanItem[]): string {
	if (stage !== AgoraStage.question && stage !== AgoraStage.linked) return stage;
	const prefix = stage === AgoraStage.linked ? 'linked' : 'question';
	const taken = new Set(items.map((item) => item.itemId));
	let n = 1;
	while (taken.has(`${prefix}-${n}`)) n += 1;

	return `${prefix}-${n}`;
}

function freshItem(
	stage: AgoraStage,
	items: readonly AgoraStagePlanItem[],
	questionKind: AgoraQuestionKind = 'open',
): AgoraStagePlanItem {
	const itemId = mintItemId(stage, items);
	if (stage === AgoraStage.question) {
		// A round asks in the book's words until the teacher types their own
		if (questionKind !== 'open') return { itemId, stage, kind: questionKind, title: '' };

		return { itemId, stage, kind: 'open', title: '', selection: defaultQuestionSelection() };
	}
	if (stage === AgoraStage.deliberation) {
		return { itemId, stage, votingTrigger: defaultVotingTrigger() };
	}

	return { itemId, stage };
}

export function planEditorReduce(
	items: readonly AgoraStagePlanItem[],
	event: PlanEditorEvent,
	options: PlanEditorOptions,
): AgoraStagePlanItem[] {
	const frozen = Math.max(0, options.frozenCount);
	const indexOf = (itemId: string): number => items.findIndex((item) => item.itemId === itemId);

	switch (event.kind) {
		case 'preset': {
			// A preset replaces the FUTURE only; history stays as it was
			const next = stagePlanPreset(event.preset).filter(
				(item) => !items.slice(0, frozen).some((kept) => kept.stage === item.stage),
			);

			return [...items.slice(0, frozen), ...next];
		}
		case 'add': {
			if (!addableStages(items, options).includes(event.stage)) return [...items];
			if (items.length >= AGORA_STAGE_PLAN.MAX_ITEMS) return [...items];
			// After the entry and the history, before results — wherever the teacher pointed
			const { first, last } = insertionRange(items, frozen);
			const at = Math.min(last, Math.max(first, event.at ?? last));
			const next = [...items];
			next.splice(at, 0, freshItem(event.stage, items, event.questionKind));

			return next;
		}
		case 'remove': {
			const index = indexOf(event.itemId);
			if (index === -1 || index < frozen || FIXED.has(items[index].stage)) return [...items];

			return items.filter((item) => item.itemId !== event.itemId);
		}
		case 'move': {
			const index = indexOf(event.itemId);
			const target = index + event.direction;
			if (index === -1 || index < frozen || FIXED.has(items[index].stage)) return [...items];
			if (target < frozen || target < 0 || target >= items.length) return [...items];
			if (FIXED.has(items[target].stage)) return [...items];
			const next = [...items];
			[next[index], next[target]] = [next[target], next[index]];

			return next;
		}
		case 'patch': {
			const index = indexOf(event.itemId);
			if (index === -1 || index < frozen) return [...items];
			const next = [...items];
			const merged: AgoraStagePlanItem = { ...items[index], ...event.patch };
			// A round carries every text and asks in the book's words unless the
			// admin typed their own; an open question needs its cutoff back
			if (merged.stage === AgoraStage.question) {
				if (questionKindOf(merged) === 'open') {
					merged.selection = merged.selection ?? defaultQuestionSelection();
				} else {
					delete merged.selection;
				}
			}
			next[index] = merged;

			return next;
		}
		default:
			return [...items];
	}
}
