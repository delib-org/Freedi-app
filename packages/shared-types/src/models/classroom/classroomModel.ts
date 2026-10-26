import {
	array,
	boolean,
	InferOutput,
	maxValue,
	minValue,
	nullable,
	number,
	object,
	optional,
	picklist,
	pipe,
	string,
} from 'valibot';

/**
 * join-class (hybrid physical-digital lesson): data model.
 *
 * Contract shared by apps/join-class (clients) and functions/src/classroom
 * (engine). Field names are the wire format; do not rename them.
 * New fields on existing schemas (subscription, statement settings) are
 * all `optional()` so strict parses of old documents keep passing.
 */

/** Collection holding one doc per table: `classTables/{mainId}--{n}`. */
export const CLASS_TABLES_COLLECTION = 'classTables';

/**
 * Seconds a speaker holds the floor when the lesson sets nothing (IA 25.2):
 * the server writes `speakerEndsAt = now + speakMs` and `speakerMs = speakMs`.
 */
export const DEFAULT_SPEAK_SECONDS = 120;

/** The speaking times the teacher can choose from (plan screen and console). */
export const SPEAK_SECONDS_CHOICES = [30, 60, 90, 120, 180, 240, 300] as const;

/** Default gate: a proposal must reach this consensus (`votingSettings.threshold`). */
export const DEFAULT_GATE = 0.6;

// >>> allProposals BEGIN
/** "כל ההצעות" (IA 19): proposals a phone gets at a time, picked by Thompson Sampling. */
export const CLASS_BATCH_SIZE = 6;
// >>> allProposals END

/** Slider range of a student's initial side. */
export const SIDE_MIN = 0;
export const SIDE_MAX = 100;

/** side < CAMP_A_BELOW is camp 'a'; side > CAMP_B_ABOVE is camp 'b'; otherwise 'center'. */
export const CAMP_A_BELOW = 40;
export const CAMP_B_ABOVE = 60;

/** decisionSupport range (5-face scale). */
export const SUPPORT_MIN = -1;
export const SUPPORT_MAX = 1;

/** Table size bounds for classAssignTables. */
export const TABLE_SIZES = [3, 4, 5] as const;
export const DEFAULT_TABLE_SIZE = 4;

export const TableStepSchema = picklist(['pick', 'talk', 'write', 'rate']);
export type TableStep = InferOutput<typeof TableStepSchema>;

export const WritingModeSchema = picklist(['each', 'table']);
export type WritingMode = InferOutput<typeof WritingModeSchema>;

export const CampSchema = picklist(['a', 'center', 'b']);
export type Camp = InferOutput<typeof CampSchema>;

/** Plenum phase on the challenge question. */
export const RoundPhaseSchema = picklist(['write', 'improve']);
export type RoundPhase = InferOutput<typeof RoundPhaseSchema>;

export const NoDeviceMemberSchema = object({
	id: string(),
	name: string(),
});
export type NoDeviceMember = InferOutput<typeof NoDeviceMemberSchema>;

export const ClassTableSchema = object({
	/** `${mainId}--${n}` */
	tableId: string(),
	mainId: string(),
	/** 1-based table number */
	n: number(),
	memberUids: array(string()),
	noDeviceMembers: array(NoDeviceMemberSchema),
	step: TableStepSchema,
	/** null = nobody asks yet (a volunteer moment) or an askerless turn. */
	askerUid: nullable(string()),
	/** Round counter; claiming the next turn increments it. */
	turn: number(),
	questionId: optional(string()),
	writingMode: WritingModeSchema,
	/** True after the first send of the turn: the mode can no longer change. */
	writingLocked: boolean(),
	speakerUid: optional(string()),
	/** Server-clock epoch ms at which the current speaker's minute ends. */
	speakerEndsAt: optional(number()),
	/**
	 * Length (ms) of the speaking time now running, written with `speakerEndsAt`
	 * so every device draws the countdown from it and a live change of the
	 * lesson setting never distorts a running turn. Server-written.
	 */
	speakerMs: optional(number()),
	spokenUids: array(string()),
	/** Guiding questions already asked at this table. */
	usedQuestionIds: array(string()),
	/**
	 * Tablemates who have asked: added when their turn reaches `talk` (`toTalk`).
	 * Optional, read as [] when missing; server-written only; kept all lesson.
	 */
	askedUids: optional(array(string())),
	/** Passed on asking ("ויתרתי על התור"): count as done, may not ask. Kept all lesson. */
	passedAskingUids: optional(array(string())),
	/** Passed this turn's minute (also in `spokenUids`); cleared with the turn fields. */
	passedSpeakingUids: optional(array(string())),
	updatedAt: number(),
});
export type ClassTable = InferOutput<typeof ClassTableSchema>;

export function classTableId(mainId: string, n: number): string {
	return `${mainId}--${n}`;
}

/** Student side slider value, 0..100 (0 = camp A pole, 100 = camp B pole). */
export const SideValueSchema = pipe(number(), minValue(SIDE_MIN), maxValue(SIDE_MAX));
/** Decision support, -1..+1. */
export const DecisionSupportSchema = pipe(number(), minValue(SUPPORT_MIN), maxValue(SUPPORT_MAX));

/**
 * Class fields on the student's workspace subscription
 * (`statementsSubscribe/{uid}--{mainId}`), spread into StatementSubscriptionSchema.
 * Student-writable (own doc): side, camp, decisionSupport. Server-written: tableId.
 */
export const ClassSubscriptionFieldsSchema = {
	side: optional(SideValueSchema),
	camp: optional(CampSchema),
	decisionSupport: optional(DecisionSupportSchema),
	tableId: optional(string()),
	/** IA 22: when the student last opened the replies on their own proposal (ms). Student-written. */
	proposalRepliesReadAt: optional(number()),
};

/** IA 22: the longest reply on a proposal, in characters (callable + phone). */
export const CLASS_REPLY_MAX_LENGTH = 200;

/** Who wrote a reply on a proposal: a classmate, the proposal's own author, or the teacher. */
export const ClassReplyRoleSchema = picklist(['class', 'author', 'teacher']);
export type ClassReplyRole = InferOutput<typeof ClassReplyRoleSchema>;

/**
 * Marker on a reply to a proposal (IA 22): a `statement` under the proposal,
 * written ONLY by the `classPostReply` callable (rules refuse a client create).
 * `proposalCreatorId` lets the author's phone keep one listener for every
 * reply to them (the proposal doc already carries the same id).
 */
export const ClassReplyMarkerSchema = object({
	role: ClassReplyRoleSchema,
	proposalCreatorId: string(),
});
export type ClassReplyMarker = InferOutput<typeof ClassReplyMarkerSchema>;

/**
 * Reply fields on a statement (IA 22), spread into StatementSchema. All
 * optional and all server-written (classPostReply / classSetItemHidden):
 * `classReply` on a reply; the counters on the proposal it answers.
 */
export const ClassReplyStatementFieldsSchema = {
	classReply: optional(ClassReplyMarkerSchema),
	/** Visible (not hidden) replies on this proposal. */
	replyCount: optional(number()),
	lastReplyAt: optional(number()),
	/** When the author was last pushed about a reply (dedupe window). */
	replyPushAt: optional(number()),
	/** Pushes sent to the author about this proposal (cap per lesson). */
	replyPushCount: optional(number()),
};

/** Marker on an option (answer / proposal) written from a table. */
export const ClassTableMarkerSchema = object({
	tableId: string(),
	/** True when one answer was written for the whole table. */
	shared: boolean(),
	/**
	 * memberUids at send time; each gets an auto +1, written by the server with
	 * Join's own evaluation id `${uid}--${optionId}` (one doc per evaluator, so a
	 * later hand rating updates it instead of counting twice). Only uids that
	 * really sit at `tableId` are honoured.
	 */
	coAuthors: array(string()),
});
export type ClassTableMarker = InferOutput<typeof ClassTableMarkerSchema>;

/** Frozen shortlist the class votes on; lives on the challenge question's statementSettings. */
export const ClassBallotSchema = object({
	candidateIds: array(string()),
	frozenAt: number(),
	/**
	 * Set while the teacher has paused the vote: no vote is cast or changed
	 * (rules + client), the votes already cast are kept, and resuming clears it.
	 * Not the same as closing (closedAt), which is final.
	 */
	pausedAt: optional(number()),
	closedAt: optional(number()),
	decisionId: optional(string()),
});
export type ClassBallot = InferOutput<typeof ClassBallotSchema>;

/**
 * How the students' vote screen shows the ballot; the teacher's switches, on
 * the challenge question's statementSettings (one challenge per lesson, so a
 * per-lesson setting). Students only ever see aggregates: the vote counts in
 * the challenge question's `selections{}`, never who voted for what.
 */
// >>> voteSummary BEGIN
/**
 * How the proposals are ordered on the vote screen, one setting for every
 * phone and the projector: 'consensus' (C_p, the default), 'votes' (live) or
 * 'random' (one shared order, seeded by the challenge id).
 */
export const ClassVoteOrderSchema = picklist(['consensus', 'votes', 'random']);
export type ClassVoteOrder = InferOutput<typeof ClassVoteOrderSchema>;
// >>> voteSummary END

export const ClassVoteDisplaySchema = object({
	/** Students see each proposal's share of the votes, live. Absent = on. */
	liveResults: optional(boolean()),
	/** Deprecated: old docs only, nobody reads it. Replaced by `order`. */
	sortBySupport: optional(boolean()),
	// >>> voteSummary BEGIN
	/** The order of the proposals for everybody. Absent = 'consensus'. */
	order: optional(ClassVoteOrderSchema),
	// >>> voteSummary END
});
export type ClassVoteDisplay = InferOutput<typeof ClassVoteDisplaySchema>;
