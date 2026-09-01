import {
	object,
	string,
	number,
	optional,
	nullable,
	array,
	picklist,
	enum_,
	InferOutput,
} from 'valibot';
import { AgoraSessionOutcome } from './agoraEnums';
import { AgoraPointsSchema, type AgoraPoints } from './agoraParticipant';

/**
 * The persistent classroom layer over Agora's per-session world.
 *
 * A session is an island: participants are anonymous and nothing survives it.
 * These models add the hierarchy that DOES survive — a school, its classes,
 * and each class's roster of pseudonymous members — so that "how did this
 * student do across the term?" is answerable without ever storing a real name.
 *
 * Identity model: a roster member is a random `memberId`, wearing a per-class
 * `alias` (a nickname). The anonymous Firebase uid a student happens to hold
 * on their current device is only a *binding* (`currentUid`), rebindable when
 * they switch devices — the memberId, never the uid, is what career scores
 * key on.
 */

export const AGORA_CLASSROOM = {
	/** Class codes are 6 chars so the join screen can tell them from 5-digit session codes */
	CLASS_CODE_LENGTH: 6,
	MIN_ALIAS_LENGTH: 2,
	MAX_ALIAS_LENGTH: 30,
	/** Rejoin PINs are 4 digits — schoolbag-notebook friendly */
	PIN_LENGTH: 4,
	/** Failed PIN entries a member doc tolerates before reclaim locks (teacher resets) */
	MAX_PIN_ATTEMPTS: 5,
	/** Prior uid bindings kept on a member (device switches) */
	UID_HISTORY_CAP: 10,
	/** Per-game rows kept on a student's career doc, newest last */
	STUDENT_GAME_ROWS_CAP: 50,
	/** Per-game rows kept on a class aggregate doc, newest last */
	CLASS_GAME_ROWS_CAP: 100,
	MAX_NAME_LENGTH: 80,
} as const;

const ActiveArchivedSchema = picklist(['active', 'archived']);

/** A school — the sys-admin's grouping of classes. Doc id: `schoolId`. */
export const AgoraSchoolSchema = object({
	schoolId: string(),
	name: string(),
	city: optional(string()),
	status: ActiveArchivedSchema,
	/** Sys-admin uid that opened the school */
	createdBy: string(),
	/** Server-maintained count of non-archived classes */
	classCount: number(),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraSchool = InferOutput<typeof AgoraSchoolSchema>;

/** A class under a school. Doc id: `classId`. Opened by a sys-admin. */
export const AgoraClassSchema = object({
	classId: string(),
	schoolId: string(),
	name: string(),
	gradeLevel: optional(string()),
	/** Teachers who own this class (array-contains queries; assigned via callable) */
	teacherIds: array(string()),
	/**
	 * Persistent 6-char join code students use ONCE to claim a roster spot.
	 * Deliberately a different length from the 5-digit session code, so the
	 * join screen can tell "join today's game" from "join your class".
	 */
	classCode: string(),
	/** Server-maintained count of active roster members */
	memberCount: number(),
	status: ActiveArchivedSchema,
	/** Sys-admin uid that opened the class */
	createdBy: string(),
	createdAt: number(),
	lastUpdate: number(),
});

export type AgoraClass = InferOutput<typeof AgoraClassSchema>;

/**
 * One roster spot in a class. Doc id: `${classId}--${memberId}`.
 *
 * The alias is the student's stable, class-scoped pseudonym — it is what the
 * teacher sees, what class sessions use as the display name, and the ONLY
 * identity ever shown. No real names, anywhere.
 */
export const AgoraClassMemberSchema = object({
	/** Stable random id — the identity career scores key on */
	memberId: string(),
	classId: string(),
	/** Denormalized from the class so aggregates never need a second read */
	schoolId: string(),
	/** Per-class nickname, unique within the class (server-enforced) */
	alias: string(),
	/** The anonymous Firebase uid currently bound to this member */
	currentUid: string(),
	/** Prior bindings from device switches, oldest first, capped */
	uidHistory: optional(array(string())),
	/**
	 * Salted hash of the 4-digit rejoin PIN. The raw PIN is returned exactly
	 * once — at claim time or on a teacher reset — and never stored.
	 */
	rejoinPinHash: optional(string()),
	/** Failed reclaim attempts since the last success (brute-force guard) */
	pinAttempts: optional(number()),
	status: picklist(['active', 'removed']),
	joinedAt: number(),
	lastActive: number(),
	lastUpdate: number(),
});

export type AgoraClassMember = InferOutput<typeof AgoraClassMemberSchema>;

export function createAgoraClassMemberId(classId: string, memberId: string): string {
	return `${classId}--${memberId}`;
}

/** One finished game as it lands on a student's career doc. */
export const AgoraStudentGameRowSchema = object({
	sessionId: string(),
	topicPackageId: string(),
	classId: string(),
	playedAt: number(),
	points: AgoraPointsSchema,
	/** The class's combined score for that game, when it was a scored (bridging) session */
	classScoreTotal: optional(number()),
	outcome: optional(enum_(AgoraSessionOutcome)),
});

export type AgoraStudentGameRow = InferOutput<typeof AgoraStudentGameRowSchema>;

/**
 * A student's career across games — server-materialized, one doc per member.
 * Doc id: `memberId` (globally unique, so no class prefix needed).
 */
export const AgoraStudentAggregateSchema = object({
	memberId: string(),
	classId: string(),
	schoolId: string(),
	gamesPlayed: number(),
	/** Sums of each points category across games (optional categories read `?? 0`) */
	totals: AgoraPointsSchema,
	avgPointsPerGame: number(),
	bestGameTotal: number(),
	lastPlayedAt: number(),
	/** Newest last, capped at STUDENT_GAME_ROWS_CAP */
	perGame: array(AgoraStudentGameRowSchema),
	lastUpdate: number(),
});

export type AgoraStudentAggregate = InferOutput<typeof AgoraStudentAggregateSchema>;

/** One finished game as it lands on the class aggregate doc. */
export const AgoraClassGameRowSchema = object({
	sessionId: string(),
	topicPackageId: string(),
	playedAt: number(),
	/** Students (AI raters excluded) who took part */
	participantCount: number(),
	classScoreTotal: optional(number()),
	/** Convergence percent for camp-less games (may be negative — the room moved apart) */
	convergenceScore: optional(number()),
	outcome: optional(enum_(AgoraSessionOutcome)),
});

export type AgoraClassGameRow = InferOutput<typeof AgoraClassGameRowSchema>;

export const AgoraOutcomeTallySchema = object({
	success: number(),
	honestDisagreement: number(),
	collapse: number(),
	/** Convergence games and games that ended before scoring */
	unscored: number(),
});

export type AgoraOutcomeTally = InferOutput<typeof AgoraOutcomeTallySchema>;

/**
 * A class's history across games — server-materialized. Doc id: `classId`.
 */
export const AgoraClassAggregateSchema = object({
	classId: string(),
	schoolId: string(),
	gamesPlayed: number(),
	/** Games that carried a class score — the divisor behind `avgClassScore` */
	scoredGames: number(),
	/**
	 * Mean class score of the SCORED games. Null when the class has only
	 * played convergence games — an honest "no comparable score", never a zero.
	 */
	avgClassScore: nullable(number()),
	outcomes: AgoraOutcomeTallySchema,
	/** Σ participantCount over games — "student game slots", the reach number */
	studentGameSlots: number(),
	lastPlayedAt: number(),
	/** Newest last, capped at CLASS_GAME_ROWS_CAP */
	perGame: array(AgoraClassGameRowSchema),
	lastUpdate: number(),
});

export type AgoraClassAggregate = InferOutput<typeof AgoraClassAggregateSchema>;

// ---------------------------------------------------------------------------
// Pure merge maths — the ONLY way aggregate docs are advanced. Both the
// functions trigger and every test go through these, so a console can trust
// that what it reads is what these produce.
// ---------------------------------------------------------------------------

function pointsSum(a: AgoraPoints, b: AgoraPoints): AgoraPoints {
	return {
		valueAccuracy: a.valueAccuracy + b.valueAccuracy,
		proposals: a.proposals + b.proposals,
		helping: a.helping + b.helping,
		rating: (a.rating ?? 0) + (b.rating ?? 0),
		revising: (a.revising ?? 0) + (b.revising ?? 0),
		total: a.total + b.total,
	};
}

export function emptyAgoraPoints(): AgoraPoints {
	return { valueAccuracy: 0, proposals: 0, helping: 0, rating: 0, revising: 0, total: 0 };
}

export function emptyStudentAggregate(
	memberId: string,
	classId: string,
	schoolId: string,
): AgoraStudentAggregate {
	return {
		memberId,
		classId,
		schoolId,
		gamesPlayed: 0,
		totals: emptyAgoraPoints(),
		avgPointsPerGame: 0,
		bestGameTotal: 0,
		lastPlayedAt: 0,
		perGame: [],
		lastUpdate: 0,
	};
}

export function emptyClassAggregate(classId: string, schoolId: string): AgoraClassAggregate {
	return {
		classId,
		schoolId,
		gamesPlayed: 0,
		scoredGames: 0,
		avgClassScore: null,
		outcomes: { success: 0, honestDisagreement: 0, collapse: 0, unscored: 0 },
		studentGameSlots: 0,
		lastPlayedAt: 0,
		perGame: [],
		lastUpdate: 0,
	};
}

/**
 * Fold one finished game into a student's career doc. Idempotence is the
 * caller's job (the session-level `aggregatedAt` guard) — but a row with a
 * sessionId already present is refused here too, as a second fence.
 */
export function mergeStudentGame(
	agg: AgoraStudentAggregate,
	row: AgoraStudentGameRow,
	now: number,
): AgoraStudentAggregate {
	if (agg.perGame.some((g) => g.sessionId === row.sessionId)) return agg;

	const perGame = [...agg.perGame, row].slice(-AGORA_CLASSROOM.STUDENT_GAME_ROWS_CAP);
	const gamesPlayed = agg.gamesPlayed + 1;
	const totals = pointsSum(agg.totals, row.points);

	return {
		...agg,
		gamesPlayed,
		totals,
		avgPointsPerGame: Math.round(totals.total / gamesPlayed),
		bestGameTotal: Math.max(agg.bestGameTotal, row.points.total),
		lastPlayedAt: Math.max(agg.lastPlayedAt, row.playedAt),
		perGame,
		lastUpdate: now,
	};
}

/** Fold one finished game into the class aggregate doc. Same double-fence as above. */
export function mergeClassGame(
	agg: AgoraClassAggregate,
	row: AgoraClassGameRow,
	now: number,
): AgoraClassAggregate {
	if (agg.perGame.some((g) => g.sessionId === row.sessionId)) return agg;

	const perGame = [...agg.perGame, row].slice(-AGORA_CLASSROOM.CLASS_GAME_ROWS_CAP);
	const outcomes = { ...agg.outcomes };
	if (row.outcome !== undefined) outcomes[row.outcome] += 1;
	else outcomes.unscored += 1;

	// avgClassScore averages only the scored games; the previous average is
	// reconstructed from its own explicit count so a capped perGame array
	// never skews it.
	let scoredGames = agg.scoredGames;
	let avgClassScore = agg.avgClassScore;
	if (row.classScoreTotal !== undefined) {
		const prevSum = (agg.avgClassScore ?? 0) * scoredGames;
		scoredGames += 1;
		avgClassScore = Math.round((prevSum + row.classScoreTotal) / scoredGames);
	}

	return {
		...agg,
		gamesPlayed: agg.gamesPlayed + 1,
		scoredGames,
		avgClassScore,
		outcomes,
		studentGameSlots: agg.studentGameSlots + row.participantCount,
		lastPlayedAt: Math.max(agg.lastPlayedAt, row.playedAt),
		perGame,
		lastUpdate: now,
	};
}

/**
 * The "how is this class doing?" line both consoles print. Derived here so the
 * teacher panel and the sys-admin panel can never disagree about advancement.
 */
export interface AgoraAdvancementSummary {
	gamesPlayed: number;
	avgClassScore: number | null;
	/** Scored games that ended in success, 0..1; null when nothing was scored */
	successRate: number | null;
	studentGameSlots: number;
	lastPlayedAt: number;
}

export function advancementSummary(agg: AgoraClassAggregate): AgoraAdvancementSummary {
	const scored = agg.outcomes.success + agg.outcomes.honestDisagreement + agg.outcomes.collapse;

	return {
		gamesPlayed: agg.gamesPlayed,
		avgClassScore: agg.avgClassScore,
		successRate: scored > 0 ? agg.outcomes.success / scored : null,
		studentGameSlots: agg.studentGameSlots,
		lastPlayedAt: agg.lastPlayedAt,
	};
}
