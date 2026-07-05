import { StatementType, QuestionType } from "../TypeEnums";
import { SourceApp } from "../engagement/SourceApp";
import type { Statement } from "../statement/StatementTypes";

/**
 * Event Control Center — Activity Registry (Phase 1).
 *
 * The registry is the entire cross-app contract for the Event Control Center.
 * An "Activity" is one unit of participation in an event's agenda, powered by
 * one of the platform's apps ("engines"). This file is PURE, serializable
 * metadata + classification only — it must not import app code (URL helpers,
 * React, Firestore). URL resolution lives in the main app
 * (`src/controllers/events/activityUrls.ts`) because the deep-link helpers live
 * there; the registry just says which engine + question-type an activity maps to.
 */

/**
 * The kinds of activity the control center understands. Each maps to a primary
 * engine (app) and, for questions, an underlying `QuestionType`.
 */
export enum ActivityType {
	/** Anonymous crowd-consensus round — mass-consensus app. */
	massConsensus = "massConsensus",
	/** Multi-stage deliberation question — main app. */
	multiStage = "multiStage",
	/** Compound (phased) question — main app. */
	compound = "compound",
	/** A plain question (suggest / evaluate / vote) — main app. */
	question = "question",
	/** A collaboratively-signed document — sign app. */
	signDocument = "signDocument",
	/** Anything the registry cannot classify (rendered read-only, no engine). */
	unknown = "unknown",
}

/**
 * Where an activity's live run-state (Queued/Open/Frozen/Closed) is read from.
 * Phase 1 only reads `questionStatus`; other sources are declared for later phases.
 */
export type ActivityStatusSource = "questionStatus" | "none";

export interface ActivityTypeDef {
	type: ActivityType;
	/**
	 * Participant-facing English label (app names never shown). Passed through
	 * the app's `t()` translator, which keys off the English string.
	 */
	label: string;
	/** Emoji glyph used until a proper icon set is wired in. */
	icon: string;
	/** The engine (app) that powers this activity. */
	sourceApp: SourceApp;
	/** Whether the control center can deep-link participants into this activity. */
	hasParticipantUrl: boolean;
	/** Whether the control center can deep-link a facilitator into an admin view. */
	hasAdminUrl: boolean;
	/** Where to read the activity's run-state. */
	statusSource: ActivityStatusSource;
}

export const ACTIVITY_REGISTRY: Record<ActivityType, ActivityTypeDef> = {
	[ActivityType.massConsensus]: {
		type: ActivityType.massConsensus,
		label: "Crowd Consensus",
		icon: "⚡",
		sourceApp: SourceApp.MASS_CONSENSUS,
		hasParticipantUrl: true,
		hasAdminUrl: true,
		statusSource: "questionStatus",
	},
	[ActivityType.multiStage]: {
		type: ActivityType.multiStage,
		label: "Multi-stage Deliberation",
		icon: "🧭",
		sourceApp: SourceApp.MAIN,
		hasParticipantUrl: true,
		hasAdminUrl: true,
		statusSource: "questionStatus",
	},
	[ActivityType.compound]: {
		type: ActivityType.compound,
		label: "Compound Question",
		icon: "🗂",
		sourceApp: SourceApp.MAIN,
		hasParticipantUrl: true,
		hasAdminUrl: true,
		statusSource: "questionStatus",
	},
	[ActivityType.question]: {
		type: ActivityType.question,
		label: "Question",
		icon: "❓",
		sourceApp: SourceApp.MAIN,
		hasParticipantUrl: true,
		hasAdminUrl: true,
		statusSource: "questionStatus",
	},
	[ActivityType.signDocument]: {
		type: ActivityType.signDocument,
		label: "Document",
		icon: "✍",
		sourceApp: SourceApp.SIGN,
		hasParticipantUrl: true,
		hasAdminUrl: true,
		statusSource: "none",
	},
	[ActivityType.unknown]: {
		type: ActivityType.unknown,
		label: "Activity",
		icon: "•",
		sourceApp: SourceApp.MAIN,
		hasParticipantUrl: false,
		hasAdminUrl: false,
		statusSource: "none",
	},
};

/**
 * Classify a child Statement into an ActivityType using the fields every
 * Statement already carries (`statementType`, `questionSettings.questionType`).
 * This is what makes the Phase 1 dashboard migration-free: activities are
 * derived on the fly from an existing group's children, no new writes.
 */
export function getActivityType(statement: Statement): ActivityType {
	if (statement.statementType === StatementType.document) {
		return ActivityType.signDocument;
	}

	if (statement.statementType === StatementType.question) {
		switch (statement.questionSettings?.questionType) {
			case QuestionType.massConsensus:
				return ActivityType.massConsensus;
			case QuestionType.multiStage:
				return ActivityType.multiStage;
			case QuestionType.compound:
				return ActivityType.compound;
			default:
				return ActivityType.question;
		}
	}

	return ActivityType.unknown;
}

/** Statement types that surface as their own activity in an event agenda. */
export function isActivityStatement(statement: Statement): boolean {
	return getActivityType(statement) !== ActivityType.unknown;
}

export function getActivityDef(type: ActivityType): ActivityTypeDef {
	return ACTIVITY_REGISTRY[type];
}
