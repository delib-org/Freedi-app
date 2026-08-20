import {
	object,
	number,
	boolean,
	optional,
	pipe,
	integer,
	minValue,
	maxValue,
	InferOutput,
} from 'valibot';

/**
 * The script of an event — which beats of the Agora deliberation an organizer
 * wants their islands to run.
 *
 * A civic session used to be one fixed shape: camps derived from the island's
 * poles, no needs, no elders, five rounds, no vote, no opening. That shape was
 * a guess, and different events want different ones — a lecture-hall audience
 * may deliberate without ever being sorted into two camps, while a longer
 * workshop may want the characters arguing back.
 *
 * Every field is optional and an absent field means the legacy default, so a
 * game doc written before scripts existed runs exactly as it always did. The
 * script is authored per GAME: one event is one game document.
 *
 * The knobs live here, on Odyssey's side, because the organizer edits them in
 * the Odyssey admin. They are projected onto each session at provision time —
 * see `scriptToFlow` — so Agora never has to read an Odyssey document.
 */
export const OdysseyGameScriptSchema = object({
	/**
	 * Whether players are sorted into camps at all.
	 *
	 * Off means no camp derived from the island's poles, no catch-up
	 * positioning screen, no stance chips — and, because bridging is a claim
	 * about crossing between two camps, a class score that measures
	 * CONVERGENCE instead: how much closer the room's opinions moved.
	 */
	stancesEnabled: optional(boolean()),
	/** Whether the characters' needs are offered during the deliberation */
	needsEnabled: optional(boolean()),
	/** Whether players may ask the two characters for an in-character verdict */
	eldersEnabled: optional(boolean()),
	/** Personal deliberation rounds; absent means AGORA_CYCLE.ROUNDS */
	rounds: optional(pipe(number(), integer(), minValue(1), maxValue(9))),
	/** Ratings asked per round; absent means AGORA_CYCLE.RATINGS_PER_ROUND */
	ratingsPerRound: optional(pipe(number(), integer(), minValue(1), maxValue(9))),
	/** Whether the event ends with a vote before the results screen */
	votingEnabled: optional(boolean()),
	/** Whether an opening scene built from the island's own text runs first */
	framingEnabled: optional(boolean()),
});

export type OdysseyGameScript = InferOutput<typeof OdysseyGameScriptSchema>;

/**
 * The script an event runs when the organizer wants the plainest possible
 * square: no camps, no needs, no characters answering back, a short cycle and
 * the island's own words as the opening.
 *
 * Written as only the fields that differ from the defaults, so reading the
 * stored document still tells you what was deliberately chosen.
 */
export const ODYSSEY_EVENT_SCRIPT: OdysseyGameScript = {
	stancesEnabled: false,
	needsEnabled: false,
	eldersEnabled: false,
	rounds: 3,
	framingEnabled: true,
};
