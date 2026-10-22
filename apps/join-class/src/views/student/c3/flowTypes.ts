import type m from 'mithril';
import type { ClassTable, ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import type { FlowKind, Mate, SubstepOverride } from '@/lib/classroom/c3Logic';
import { FlowFeed } from './FlowFeed';

/** The state one TableFlow keeps across redraws (no store: it dies with the screen). */
export class FlowState {
	feed = new FlowFeed();
	override: SubstepOverride | null = null;
	sheetOpen = false;
	busy = false;
	error: string | null = null;
	retry: (() => Promise<void>) | null = null;
	chosenId: string | null = null;
	chosenTurn = 0;
	editing = false;
	liveFor: string | null = null;
	/** The asker's own question while every teacher question is used up (A-own). */
	ownText = '';
	ownCreatedId: string | null = null;
	redrawTimer: ReturnType<typeof setTimeout> | null = null;
	/** The minute end the timer above was set for. */
	redrawFor: number | null = null;
}

/** What the shared frame needs from the screen of one flow (Table talk or Proposals). */
export interface FlowParts {
	headerLine: string;
	/** The instruction of the official step; undefined when the body carries it (V2). */
	instruction: string | undefined;
	/** The body of the VIEWED step. */
	body: m.Children;
	action: m.Children;
	/** The inverted "screens down" frame. */
	down: boolean;
	/** The asker line under the instruction; null hides it. */
	askerLine: string | null;
	askerMark: boolean;
	/** Beside the asker line (Proposals: the class's writing). */
	barExtra: m.Children;
	/** Drawn after the frame (Proposals: the class sheet). */
	overlay: m.Children;
	/** The strip is shown (Table talk hides it once the table is done). */
	showStrip: boolean;
}

/** Everything a flow's parts function reads, built once per redraw by TableFlow. */
export interface FlowCtx {
	main: Statement;
	kind: FlowKind;
	table: ClassTable;
	uid: string;
	mates: Mate[];
	self: FlowState;
	feed: FlowFeed;
	/** The screen the student looks at. */
	step: TableStep;
	/** The table's official step as a screen of this flow. */
	official: TableStep;
	questions: Statement[];
	challenge: Statement | null;
	/** Server clock, epoch ms, at this redraw. */
	now: number;
	someone: string;
	run: (op: () => Promise<unknown>) => void;
	act: (action: ClassTableAction) => void;
}
