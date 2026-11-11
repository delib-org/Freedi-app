export const TABLE_SIZE_DEFAULT = 7;
export const MAX_RANKED_PREFERENCES = 3;
/** In population-sd units. A table whose mean sits 0.3 sd off the crowd still reads as the crowd. */
export const BALANCE_TOLERANCE_DEFAULT = 0.3;
export const RESTARTS_DEFAULT = 4;
export const MAX_IMPROVEMENT_PASSES = 60;
/** Strict-improvement threshold so floating-point noise never cycles the search. */
export const IMPROVEMENT_EPSILON = 1e-9;
/** A second choice counts this much of a first choice when deciding how many tables a topic gets; a third, this squared. */
export const LOWER_RANK_DEMAND_FACTOR = 0.01;
/** An axis whose sd is below this share of max(1, |mean|) is treated as one shared value. */
export const CONSTANT_AXIS_RELATIVE_SD = 1e-9;
/** Swaps the search may evaluate over all restarts of one run; a count, never a clock, so a seed still gives the same room. */
export const SWAP_TRIES_DEFAULT = 50_000_000;
/** Fewest newcomers worth opening a table for beside pinned tables; fewer take a free pinned seat instead. */
export const MIN_OPENED_TABLE_SIZE = 3;
