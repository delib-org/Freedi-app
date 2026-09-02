/**
 * The stage plan editor's rules: what can be added where, what can move,
 * what is frozen. Pure — the component renders and dispatches, this decides.
 *
 * Two fixed ends (lobby first, results last), single instances of every
 * stage but `question`, and a frozen prefix: once a game is running, the
 * items up to and including the current one are history and cannot change.
 */
import {
	AgoraStage,
	AGORA_CHARACTER_STAGES,
	AGORA_PLANNABLE_STAGES,
	defaultQuestionSelection,
	defaultVotingTrigger,
	stagePlanPreset,
	type AgoraStagePlanItem,
	type AgoraStagePlanPreset,
} from '@freedi/shared-types';

export type PlanEditorEvent =
	| { kind: 'add'; stage: AgoraStage }
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
		if (stage === AgoraStage.question) return true;

		return !present.has(stage);
	});
}

/** A fresh id: the stage name for single-instance stages, numbered for questions */
export function mintItemId(stage: AgoraStage, items: readonly AgoraStagePlanItem[]): string {
	if (stage !== AgoraStage.question) return stage;
	const taken = new Set(items.map((item) => item.itemId));
	let n = 1;
	while (taken.has(`question-${n}`)) n += 1;

	return `question-${n}`;
}

function freshItem(stage: AgoraStage, items: readonly AgoraStagePlanItem[]): AgoraStagePlanItem {
	const itemId = mintItemId(stage, items);
	if (stage === AgoraStage.question) {
		return { itemId, stage, title: '', selection: defaultQuestionSelection() };
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
			// Before results, never inside the frozen prefix
			const resultsAt = items.findIndex((item) => item.stage === AgoraStage.results);
			const at = Math.max(frozen, resultsAt === -1 ? items.length : resultsAt);
			const next = [...items];
			next.splice(at, 0, freshItem(event.stage, items));

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
			next[index] = { ...items[index], ...event.patch };

			return next;
		}
		default:
			return [...items];
	}
}
