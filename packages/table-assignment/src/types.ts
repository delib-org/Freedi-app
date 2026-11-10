/**
 * Wire-free contracts of the table-assignment engine. Pure data in, pure data
 * out: no Firebase, no clock, no global randomness (the seed is an input).
 */

export interface Participant {
	id: string;
	/**
	 * Where the participant stands, one number per axis (the classroom side
	 * slider is one axis, 0..100). Omitted when they declared nothing; such
	 * participants are free to sit anywhere and do not count toward balance.
	 */
	side?: readonly number[];
	/** Topic ids, best first. Empty when they have no preference. */
	preferences: readonly string[];
}

export interface Topic {
	id: string;
	/** Hard cap on tables opened for this topic; unlimited when omitted. */
	maxTables?: number;
}

/**
 * A table that already exists. Its members never move and it keeps its topic.
 * Members no longer among the participants are dropped from it; newcomers may
 * fill its free seats. Throws when a member is pinned twice, the table is
 * larger than tableSize, or the topic is unknown.
 */
export interface PinnedTable {
	topicId: string;
	memberIds: readonly string[];
}

export interface AssignmentOptions {
	/** Seats per table, the hard upper bound. Default TABLE_SIZE_DEFAULT. */
	tableSize?: number;
	/** How many ranked preferences count. Default MAX_RANKED_PREFERENCES. */
	maxRankedPreferences?: number;
	/**
	 * Worst allowed table deviation from the crowd, in population-sd units
	 * (see tableDeviation). Default BALANCE_TOLERANCE_DEFAULT.
	 */
	balanceTolerance?: number;
	/** Independent deal-and-improve runs; the best is returned. Default RESTARTS_DEFAULT. */
	restarts?: number;
	/**
	 * Most swaps the search may evaluate over all restarts. When it runs out the
	 * best seating so far is returned. Default SWAP_TRIES_DEFAULT.
	 */
	maxSwapTries?: number;
	/** Seed of the lottery. The same seed and input always give the same output. */
	seed?: number;
	/**
	 * Tables a re-run must keep, in this order, at the front of the output.
	 * Lets a facilitator seat latecomers without reshuffling the room; see
	 * PinnedTable.
	 */
	pinnedTables?: ReadonlyArray<PinnedTable>;
}

export interface TableStats {
	/** Members who declared a side. */
	n: number;
	/** Per axis. Empty when no member declared a side. */
	mean: number[];
	sd: number[];
	/** Distance from the crowd in sd units; 0 is a perfect mirror. */
	deviation: number;
}

export interface AssignedTable {
	index: number;
	topicId: string;
	memberIds: string[];
	stats: TableStats;
}

export interface PopulationStats {
	n: number;
	mean: number[];
	sd: number[];
}

export interface BalanceMetrics {
	/** Worst table deviation; this is what the tolerance is tested against. */
	max: number;
	mean: number;
	tolerance: number;
	withinTolerance: boolean;
}

export interface PreferenceMetrics {
	/** byRank[0] = participants seated at their first choice, and so on. */
	byRank: number[];
	/** Had preferences, got none of them. */
	none: number;
	/** Declared no preference at all. */
	noPreference: number;
	score: number;
	/** Score if everyone had their first choice. */
	maxScore: number;
}

export interface AssignmentMetrics {
	population: PopulationStats;
	balance: BalanceMetrics;
	preferences: PreferenceMetrics;
}

export interface Assignment {
	tables: AssignedTable[];
	seed: number;
	metrics: AssignmentMetrics;
}

/** One table per topic allocation, before anyone is seated. */
export interface TablePlan {
	topicId: string;
	size: number;
}
