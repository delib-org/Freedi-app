import {
	object,
	string,
	number,
	optional,
	type InferOutput,
	record,
	unknown,
	enum as valibotEnum,
} from "valibot";

/** Actions tracked for research purposes */
export enum ResearchAction {
	// Auth
	LOGIN = "login",
	LOGOUT = "logout",

	// Content creation
	CREATE_STATEMENT = "create_statement",
	UPDATE_STATEMENT = "update_statement",
	DELETE_STATEMENT = "delete_statement",

	// Evaluations
	EVALUATE = "evaluate",
	UPDATE_EVALUATION = "update_evaluation",
	REMOVE_EVALUATION = "remove_evaluation",

	// Voting
	VOTE = "vote",
	UPDATE_VOTE = "update_vote",

	// Navigation
	VIEW_SCREEN = "view_screen",
	LEAVE_SCREEN = "leave_screen",

	// Proposals
	SUBMIT_PROPOSAL = "submit_proposal",
	JOIN_PROPOSAL = "join_proposal",
	LEAVE_PROPOSAL = "leave_proposal",

	// Clustering
	VIEW_CLUSTER = "view_cluster",

	// Session
	SESSION_START = "session_start",
	SESSION_END = "session_end",
}

export const ResearchActionSchema = valibotEnum(ResearchAction);

export const ResearchLogSchema = object({
	/** Unique log entry ID */
	logId: string(),
	/** User who performed the action (uid only — no PII) */
	userId: string(),
	/** The action performed */
	action: string(),
	/** Timestamp in milliseconds */
	timestamp: number(),
	/** Top-level statement (event/discussion) this action belongs to */
	topParentId: optional(string()),
	/** Direct parent statement ID */
	parentId: optional(string()),
	/** The statement being acted upon */
	statementId: optional(string()),
	/** Screen/route the user is on */
	screen: optional(string()),
	/** Previous value (for updates) */
	previousValue: optional(string()),
	/** New value (for updates) */
	newValue: optional(string()),
	/** Session identifier to correlate actions within a visit */
	sessionId: optional(string()),
	/** Login count for this user (1st, 2nd, etc.) */
	loginCount: optional(number()),
	/** Source app: main, mass-consensus, sign */
	sourceApp: optional(string()),
	/** Arbitrary metadata for extensibility */
	metadata: optional(record(string(), unknown())),
});

export type ResearchLog = InferOutput<typeof ResearchLogSchema>;

/** Helper to generate a research log document ID */
export function getResearchLogId(userId: string, timestamp: number): string {
	return `${userId}_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── Centralized action metadata (single source of truth) ───────────

/** High-level categories for grouping actions */
export type ResearchCategory =
	| "logins"
	| "evaluations"
	| "votes"
	| "statements"
	| "proposals"
	| "screenViews";

/** Maps every ResearchAction to its category (null = uncategorized) */
export const RESEARCH_ACTION_CATEGORY: Record<ResearchAction, ResearchCategory | null> = {
	[ResearchAction.LOGIN]: "logins",
	[ResearchAction.LOGOUT]: null,
	[ResearchAction.CREATE_STATEMENT]: "statements",
	[ResearchAction.UPDATE_STATEMENT]: "statements",
	[ResearchAction.DELETE_STATEMENT]: "statements",
	[ResearchAction.EVALUATE]: "evaluations",
	[ResearchAction.UPDATE_EVALUATION]: "evaluations",
	[ResearchAction.REMOVE_EVALUATION]: "evaluations",
	[ResearchAction.VOTE]: "votes",
	[ResearchAction.UPDATE_VOTE]: "votes",
	[ResearchAction.VIEW_SCREEN]: "screenViews",
	[ResearchAction.LEAVE_SCREEN]: null,
	[ResearchAction.SUBMIT_PROPOSAL]: "proposals",
	[ResearchAction.JOIN_PROPOSAL]: "proposals",
	[ResearchAction.LEAVE_PROPOSAL]: null,
	[ResearchAction.VIEW_CLUSTER]: null,
	[ResearchAction.SESSION_START]: null,
	[ResearchAction.SESSION_END]: null,
};

/** Human-readable labels for each action */
export const RESEARCH_ACTION_LABELS: Record<ResearchAction, string> = {
	[ResearchAction.LOGIN]: "Login",
	[ResearchAction.LOGOUT]: "Logout",
	[ResearchAction.CREATE_STATEMENT]: "New Statement",
	[ResearchAction.UPDATE_STATEMENT]: "Update Statement",
	[ResearchAction.DELETE_STATEMENT]: "Delete Statement",
	[ResearchAction.EVALUATE]: "Evaluation",
	[ResearchAction.UPDATE_EVALUATION]: "Re-evaluation",
	[ResearchAction.REMOVE_EVALUATION]: "Remove Evaluation",
	[ResearchAction.VOTE]: "Vote",
	[ResearchAction.UPDATE_VOTE]: "Update Vote",
	[ResearchAction.VIEW_SCREEN]: "Screen View",
	[ResearchAction.LEAVE_SCREEN]: "Left Screen",
	[ResearchAction.SUBMIT_PROPOSAL]: "Proposal",
	[ResearchAction.JOIN_PROPOSAL]: "Joined Proposal",
	[ResearchAction.LEAVE_PROPOSAL]: "Left Proposal",
	[ResearchAction.VIEW_CLUSTER]: "View Cluster",
	[ResearchAction.SESSION_START]: "Session Start",
	[ResearchAction.SESSION_END]: "Session End",
};

/** Colors for each category (used in charts and dashboards) */
export const RESEARCH_CATEGORY_COLORS: Record<ResearchCategory, string> = {
	logins: "#3B82F6",
	evaluations: "#F59E0B",
	votes: "#8B5CF6",
	statements: "#F43F5E",
	proposals: "#14B8A6",
	screenViews: "#94A3B8",
};

/** Global actions that don't belong to a specific statement */
export const RESEARCH_GLOBAL_ACTIONS: ResearchAction[] = [
	ResearchAction.LOGIN,
	ResearchAction.LOGOUT,
	ResearchAction.SESSION_START,
	ResearchAction.SESSION_END,
];

/** Helper: get category for an action string */
export function getResearchCategory(action: string): ResearchCategory | null {
	return RESEARCH_ACTION_CATEGORY[action as ResearchAction] ?? null;
}

/** Helper: get label for an action string */
export function getResearchActionLabel(action: string): string {
	return RESEARCH_ACTION_LABELS[action as ResearchAction] ?? action;
}
