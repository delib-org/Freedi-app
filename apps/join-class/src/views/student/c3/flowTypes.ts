import type m from 'mithril';
import type { ClassTable, ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import type { FlowKind, Mate } from '@/lib/classroom/c3Logic';
import { FlowFeed } from './FlowFeed';

/** The state one TableFlow keeps across redraws (no store: it dies with the screen). */
export class FlowState {
	feed = new FlowFeed();
	/** A call whose winner the server decides is out: the screen waits for its answer. */
	busy = false;
	/** Optimistic actions in flight, by action: a second tap on the same one is ignored. */
	pending = new Set<string>();
	error: string | null = null;
	retry: (() => Promise<void>) | null = null;
	/** Table talk: the question chosen on this phone (nothing is written until "I want to start"). */
	chosenId: string | null = null;
	/** The turn the choice above was made at: a new turn clears it. */
	chosenTurn = 0;
	/** The own-question row is the chosen one. */
	ownSelected = false;
	editing = false;
	/** The proposal the box should open on ("Edit" on a pinned card, "improve" from the replies). */
	editRequest: string | null = null;
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
	/** The instruction of the table's step; undefined when the body carries it. */
	instruction: string | undefined;
	/** Table talk: the instruction is the chosen question (big, top third). */
	questionHeading?: boolean;
	/** Proposals: the challenge as a big heading above the instruction ("Propose a solution to ..."). */
	ask?: string;
	/** The body of the VIEWED step. */
	body: m.Children;
	action: m.Children;
	/** The inverted "screens down" frame. */
	down: boolean;
	/** Proposals: the read-only Talk, Write, Rate marker, current part marked; absent at Table talk. */
	strip?: TableStep;
}

export interface RunOptions {
	optimistic?: { key: string };
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
	/** The table's step as a screen of this flow (the phone always follows the table). */
	step: TableStep;
	questions: Statement[];
	challenge: Statement | null;
	/** Server clock, epoch ms, at this redraw. */
	now: number;
	someone: string;
	/**
	 * Run one call with the inline error + retry. `optimistic` (the screen already shows the
	 * result, keyed by `key`) leaves the screen live; without it the screen is `busy` until the answer.
	 */
	run: (op: () => Promise<unknown>, options?: RunOptions) => void;
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
