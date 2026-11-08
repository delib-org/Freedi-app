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
