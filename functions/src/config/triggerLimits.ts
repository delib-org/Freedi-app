/**
 * `maxInstances` for the Firestore triggers that run on every rating,
 * statement, subscription, view and vote write.
 *
 * How the numbers were chosen (docs/scale/main-1000-baseline.md):
 * - Load: 1,000 people in one question. The pessimistic peak is everyone
 *   rating once every 4 s, about 250 ratings/s. The baseline's own model
 *   (10 ratings each) averages far less.
 * - Capacity: these triggers run with the v2 default of 80 concurrent requests
 *   on 1 vCPU. `newEvaluation` is the costliest: 333 docs read and 17 written
 *   per rating. Assuming about 50 ms of CPU each, one instance handles about
 *   20 ratings/s, so the peak needs about 13 instances. The 50 ms is an
 *   estimate; the emulator baseline cannot measure production CPU.
 * - Headroom: each cap is about 3x that need, because instances start late
 *   under a sudden burst.
 *
 * What a cap does not do: protect Firestore. Contention on the question and
 * option documents appears at a few writes per second per document, and
 * 40 instances x 80 requests allows thousands of concurrent writers. A cap low
 * enough to protect one document would stall 1,000 people. The caps bound
 * runaway cost, for example a trigger loop, and the Firestore connections and
 * memory one burst can take. Lower contention by writing less (plan 3.3, 3.4).
 *
 * If a cap is reached: Cloud Run answers the event delivery with 429 ("no
 * available instance"). Google's documentation disagrees on whether a trigger
 * without `retry` gets the event redelivered, so treat an event past the cap
 * as possibly delayed and possibly lost: a rating not counted, a member count
 * off by one. That is why the caps sit well above the computed need. A 429 on
 * any of these functions in Cloud Logging means raise the cap.
 *
 * The platform default when unset is 100, so these only ever lower the limit.
 */
export const TRIGGER_MAX_INSTANCES = {
	/** newEvaluation, updateEvaluation, deleteEvaluation: the costliest per event. */
	ratingWrite: 40,
	/** Light triggers that also run once per rating (chat, Agora, clusters, notices). */
	ratingSideEffect: 20,
	/** Triggers on every update of a statement doc; about 1 per rating, a few ms each. */
	statementWrite: 30,
	/** New answers: rare per person, but each fans out to every subscriber. */
	statementCreate: 20,
	/** The language check on each new answer: its own group because it waits on an AI call. */
	answerModeration: 20,
	/** Arrivals: 1,000 people joining within a minute is about 17 events/s. */
	subscriptionWrite: 20,
	/** First view per person; same arrival curve as subscriptions. */
	viewWrite: 20,
	/** Votes: at most one per person per question, the same arrival curve. */
	voteWrite: 20,
} as const;
