import {
	object,
	string,
	number,
	boolean,
	optional,
	array,
	tuple,
	enum_,
	InferOutput,
} from 'valibot';
import { AgoraCamp } from './agoraEnums';

/**
 * The five rating levels a student can pick, in bucket order.
 * Index i in a distribution corresponds to AGORA_RATING_LEVELS[i].
 */
export const AGORA_RATING_LEVELS = [-1, -0.5, 0, 0.5, 1] as const;

/** Counts per rating level: [n(-1), n(-0.5), n(0), n(+0.5), n(+1)] */
export const AgoraRatingDistSchema = tuple([number(), number(), number(), number(), number()]);

export type AgoraRatingDist = InferOutput<typeof AgoraRatingDistSchema>;

/** Per-camp evaluation aggregates for one proposal */
export const AgoraCampAggregateSchema = object({
	/** Sum of evaluation values (-1..1 each) from this camp */
	sum: number(),
	/** Number of evaluators from this camp */
	n: number(),
	/** Number of positive (> 0) evaluations from this camp */
	positiveN: number(),
	/**
	 * Rating counts per level from the STUDENTS of this camp — the second
	 * moment the consensus score needs, which {sum, n} alone cannot supply.
	 *
	 * Students only, and necessarily so: the characters' synthetic raters carry
	 * off-grid values (agoraScoreToEvaluation(33) === -0.34) that no five-level
	 * histogram can hold, and they are not members of the class whose finite
	 * population N counts. They keep moving sum/n/positiveN, which is what the
	 * bridging score reads.
	 *
	 * Integers with a hard >= 0 invariant, so a re-delivered trigger can be
	 * clamped instead of permanently poisoning the variance — a repair a bare
	 * sum-of-squares could not offer, because nothing about it looks wrong.
	 *
	 * OPTIONAL: score docs written before class consensus existed have no
	 * histogram. A missing one means "no consensus yet", never a crash — the
	 * client parses these docs strictly, so a required field would make every
	 * legacy proposal vanish from the students' square.
	 */
	studentDist: optional(AgoraRatingDistSchema),
});

export type AgoraCampAggregate = InferOutput<typeof AgoraCampAggregateSchema>;

/**
 * Finite-population consensus over the class, for one proposal.
 * Recomputed on every rating; absent until a student histogram exists.
 */
export const AgoraClassConsensusSchema = object({
	/** C_p = μ − t·SEM*·√(1 − n/N). At a census this is exactly μ. */
	consensus: number(),
	/** μ over student raters, uncorrected — the raw centre of opinion */
	mean: number(),
	/** Student raters counted (Σ studentDist across camps) */
	n: number(),
	/** Eligible pool: positioned students minus the author */
	eligible: number(),
	/** n / eligible, clamped to [0,1] — how much of the class has spoken */
	coverage: number(),
	/**
	 * C_p as a fraction of the best a class of this size could have reached at
	 * this coverage, in [0,1]. A student's rating budget is fixed, so coverage
	 * falls as the class grows and raw C_p falls with it — at identical class
	 * sentiment a class of 40 scores far below a class of 6. This is the number
	 * to compare ACROSS classes; `consensus` is the one to read within one.
	 */
	normalized: number(),
	/**
	 * 1 − like-mindedness. Carries NO finite-population correction: dispersion
	 * is not sampling error, so a split class stays split at a census.
	 */
	polarization: number(),
});

export type AgoraClassConsensus = InferOutput<typeof AgoraClassConsensusSchema>;

export const AgoraCriterionScoreSchema = object({
	criterionId: string(),
	score: number(),
});

export type AgoraCriterionScore = InferOutput<typeof AgoraCriterionScoreSchema>;

export const AgoraPlausibilitySchema = object({
	/** Weighted total, 0-100 */
	score: number(),
	criterionScores: array(AgoraCriterionScoreSchema),
	reasoning: string(),
	scoredAt: number(),
});

export type AgoraPlausibility = InferOutput<typeof AgoraPlausibilitySchema>;

/**
 * Camp-aware scoring for one proposal. Doc id = proposal statementId.
 * Written ONLY by Cloud Functions (admin SDK) — client-write is denied.
 */
export const AgoraProposalScoreSchema = object({
	statementId: string(),
	sessionId: string(),
	authorCamp: enum_(AgoraCamp),
	perCamp: object({
		left: AgoraCampAggregateSchema,
		right: AgoraCampAggregateSchema,
		center: AgoraCampAggregateSchema,
	}),
	/** 0-100; cross-camp support weighted above same-camp support */
	bridgingScore: number(),
	/** Set once the bridging credit was awarded (idempotency guard) */
	bridgingCreditAwardedAt: optional(number()),
	/**
	 * Highest bridging tier already paid out: 0/absent = none, 1 = reached
	 * across (CREDIT_THRESHOLD_TIER_1), 2 = full bridge (CREDIT_THRESHOLD).
	 * Monotonic — a later dip never claws a tier back, so the author is
	 * never punished for a proposal that moved.
	 */
	bridgingTierAwarded: optional(number()),
	/**
	 * Bridging score captured the moment the author last edited the text.
	 * The owner's "ratings moved / bridge power rose" chip is measured
	 * against THIS, server-side, so the signal survives a refresh or a
	 * device switch (it used to live in sessionStorage and evaporated).
	 */
	bridgingAtLastEdit: optional(number()),
	/**
	 * Class average support (0-100, see `agoraClassSupport`) the moment the
	 * author last edited — the baseline the improvement loop actually reports
	 * against.
	 *
	 * Separate from `bridgingAtLastEdit` because the two answer different
	 * questions. Bridging is the game's currency and is blended and damped, so
	 * it can sit still through a real change of mind; the average moves with
	 * every one of them. The author is owed the second number, and the first
	 * stays for the score line that pays them.
	 *
	 * ABSENT means nobody had rated at the moment of the edit — no baseline, so
	 * the loop reports where the class stands instead of how far it moved. It is
	 * never written as 0 for that case: 0 here means "the class is unanimously
	 * against", which is the opposite of "the class has not spoken".
	 */
	supportAtLastEdit: optional(number()),
	/** When the author last saved a text change (pairs with the baseline) */
	lastEditAt: optional(number()),
	/**
	 * The proposal's revision journey, oldest first: one entry per revision
	 * EVENT (rapid saves are debounced into one, see
	 * AGORA_ANTI_GAMING.REVISION_DEBOUNCE_MS), where `bridgingAtEdit` is the
	 * bridging score the moment that edit was saved — i.e. the closing score
	 * of the version the edit replaced. The live `bridgingScore` is always the
	 * current version's reading, so the client renders
	 * v1·h[0] → v2·h[1] → … → vN·(live). Capped at
	 * AGORA_ANTI_GAMING.EDIT_HISTORY_MAX: past the cap the FIRST entry (where
	 * the journey began) and the newest MAX−1 survive — the start and the
	 * recent road matter, the middle doesn't.
	 */
	editHistory: optional(
		array(
			object({
				editedAt: number(),
				bridgingAtEdit: number(),
			}),
		),
	),
	/**
	 * Revision-credit bookkeeping (see AGORA_POINTS.REVISION_CREDIT).
	 * `studentRatingsAtCredit` is the student-rater tally the last time a
	 * revision was credited — the feedback gate compares against it, so the
	 * same ratings can never pay for two revisions. One proposal per student
	 * makes `credited` both a per-proposal and per-session counter.
	 */
	revisionCredit: optional(
		object({
			lastCreditAt: number(),
			studentRatingsAtCredit: number(),
			credited: number(),
		}),
	),
	/**
	 * When the owner last thanked a helper on this proposal — the second half
	 * of the revision-credit feedback gate (a thank IS new feedback: it means
	 * an idea arrived and the owner engaged with it). Stamped by
	 * agoraResolveSuggestion, read by the proposal-write trigger.
	 */
	lastThankAt: optional(number()),
	/**
	 * Helpers whose thanked idea has already paid the author's weave credit.
	 * Since the accept→implemented chain was retired, "weaving" is attested by
	 * the pair thank-then-revise: the first real revision AFTER a helper's
	 * thank pays WEAVE_CREDIT_PER_HELPER, once per distinct helper, up to
	 * MAX_WEAVE_CREDITS_PER_PROPOSAL. This list is the idempotency ledger.
	 */
	weaveCreditedHelpers: optional(array(string())),
	/**
	 * True when the author is a positioned student, and therefore holds a seat
	 * in the camp census that must NOT count toward their own proposal's
	 * eligible rater pool — the square never serves anyone their own text.
	 *
	 * Distinct from `authorCamp`, which falls back to `center` when the author
	 * never positioned. Absent on legacy docs, read as false, which makes the
	 * pool one seat too large and the consensus slightly understated. Every
	 * fallback here must err that way round: too large an N is conservative,
	 * too small inflates the score.
	 */
	authorPositioned: optional(boolean()),
	/** Finite-population class consensus over the student histogram */
	classConsensus: optional(AgoraClassConsensusSchema),
	plausibility: optional(AgoraPlausibilitySchema),
	lastUpdate: number(),
});

export type AgoraProposalScore = InferOutput<typeof AgoraProposalScoreSchema>;
