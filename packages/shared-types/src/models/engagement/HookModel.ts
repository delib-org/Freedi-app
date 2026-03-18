export enum HookPhase {
	TRIGGER = 'trigger',
	ACTION = 'action',
	VARIABLE_REWARD = 'variable_reward',
	INVESTMENT = 'investment',
}

export enum ActionLevel {
	ZERO_FRICTION = 0, // Read/browse - no account needed
	ONE_TAP = 1, // Evaluate, Vote, React
	SHORT_INPUT = 2, // Comment, Subscribe, Set preferences
	FULL_CREATION = 3, // Create option/suggestion/discussion
}
