import type m from 'mithril';
import type { ClassTable, ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import type { FlowKind, Mate, SubstepOverride } from '@/lib/classroom/c3Logic';
import { LineHold } from '@/lib/classroom/liveWriting';
import { FlowFeed } from './FlowFeed';

/** The tablemate whose text the watch view shows (IA 17): their last known draft, kept after they end. */
export interface WatchTarget {
	uid: string;
	name: string;
	text: string;
	lastUpdate: number;
	/** The "sent" / "stopped" line already announced for this ending. */
	endAnnounced: 'sent' | 'stopped' | null;
}

/** The state one TableFlow keeps across redraws (no store: it dies with the screen). */
export class FlowState {
	feed = new FlowFeed();
	override: SubstepOverride | null = null;
	sheetOpen = false;
	busy = false;
	error: string | null = null;
	retry: (() => Promise<void>) | null = null;
	/** Table talk: the question chosen on this phone (nothing is written until "I want to start"). */
	chosenId: string | null = null;
	/** The turn the choice above was made at: a new turn clears it. */
	chosenTurn = 0;
	/** The own-question row is the chosen one. */
	ownSelected = false;
	editing = false;
	liveFor: string | null = null;
	/** The own question this student is writing (kept while another row is chosen). */
	ownText = '';
	/** The id of the own question already created, so a retry never creates it twice. */
	ownCreatedId: string | null = null;
	/** "Pick a question first" was shown (a tap on a dimmed start button). */
	pickFirst = false;
	/** Lost a race: a quiet line for a few seconds naming who was first. */
	wasFirst: { kind: 'turn' | 'floor'; until: number } | null = null;
	/** Table talk: the state last drawn (focus moves to the new heading when it changes). */
	stateKey = '';
	/** When this student last tapped a control (their own tap must not steal focus). */
	lastTapAt = 0;
	/** Live writing: the line's hold timer, the watch view's target, and what was announced. */
	lineHold = new LineHold();
	lineTimer: ReturnType<typeof setTimeout> | null = null;
	lineTimerAt: number | null = null;
	watch: WatchTarget | null = null;
	announced = new Set<string>();
	liveMessage = '';
	redrawTimer: ReturnType<typeof setTimeout> | null = null;
	/** The minute end the timer above was set for. */
	redrawFor: number | null = null;
}

/** What the shared frame needs from the screen of one flow (Table talk or Proposals). */
export interface FlowParts {
	headerLine: string;
	/** Table talk: the state's status line for the screen reader's live region, and the state id. */
	status?: string;
	stateKey?: string;
	/** The instruction of the official step; undefined when the body carries it (V2). */
	instruction: string | undefined;
	/** Table talk: the instruction is the chosen question (big, top third). */
	questionHeading?: boolean;
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
	/** Switches THIS phone's sub-step (Proposals); never calls the table. */
	goto: (step: TableStep) => void;
	run: (op: () => Promise<unknown>) => void;
	act: (action: ClassTableAction) => void;
}

/** A failure that names its own message key (e.g. the own question could not be created). */
export class FlowError extends Error {
	readonly key: string;

	constructor(key: string) {
		super(key);
		this.key = key;
	}
}
