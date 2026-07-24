import { StatementType, QuestionType } from "../TypeEnums";
import { SourceApp } from "../engagement/SourceApp";

/**
 * Cross-App Statement Router — Route Registry (v1).
 *
 * Sibling of `activityRegistry.ts`, same philosophy: PURE, serializable
 * metadata only — no app code, no URL helpers, no React. A "route target" is
 * a lens another app offers over the same Statement (same statementId, zero
 * copies). URL resolution lives in `@freedi/event-core`
 * (`createActivityUrlResolver().getRouteLink`) and derivation of the
 * per-Statement target list lives in `deriveRouteTargets()` there.
 *
 * Labels are participant-facing English keys (verb-first outcomes, never app
 * brand names) translated through each app's `t()` — the exact convention of
 * `ACTIVITY_REGISTRY.label`.
 */

/** A write that must complete before the destination opens. */
export enum RoutePrerequisite {
	/** Pure open — the route is just a deep link. */
	none = "none",
	/** Sign: set `isDocument: true` on the Statement before opening. */
	markDocument = "markDocument",
	/**
	 * Mass-consensus: set `questionSettings.questionType = massConsensus`
	 * on the Statement before opening.
	 */
	markMassConsensus = "markMassConsensus",
}

/** Minimum role required to see a route target at all. */
export type RouteMinRole = "admin" | "member";

export interface RouteTargetDef {
	/** The destination app (engine) this route opens the Statement in. */
	sourceApp: SourceApp;
	/** Verb-first outcome label, English key for `t()`. */
	label: string;
	/** One-liner shown under the label in the picker, English key for `t()`. */
	description: string;
	/** Emoji glyph, same convention as `ActivityTypeDef.icon`. */
	icon: string;
	/**
	 * Statement types for which this target appears in the picker at all
	 * (enabled OR disabled-with-reason). Types not listed here hide the row.
	 */
	visibleTypes: StatementType[];
	/**
	 * Statement types this target can actually route. A type that is visible
	 * but not eligible renders disabled with `ineligibleReason`.
	 */
	eligibleTypes: StatementType[];
	/**
	 * Optional narrowing by question type. Omitted = any question type.
	 * Only consulted when the statement is a question.
	 */
	eligibleQuestionTypes?: QuestionType[];
	/** Minimum role required to see this target (v1: everything is admin). */
	minRole: RouteMinRole;
	/** Write required before opening, if any. */
	prerequisite: RoutePrerequisite;
	/**
	 * English key for `t()` explaining why a visible-but-ineligible row is
	 * disabled (e.g. Sign shown on a question card in v1).
	 */
	ineligibleReason?: string;
}

/**
 * v1 registry: the three first-class targets (Join, Sign, Mass-Consensus).
 * Adding a destination later is a data change here + a base URL in
 * `EventUrlConfig` — no new UI.
 */
export const ROUTE_REGISTRY: RouteTargetDef[] = [
	{
		sourceApp: SourceApp.JOIN,
		label: "Facilitate a live joining session",
		description: "Run this question live so participants join the answers they support",
		icon: "🤝",
		visibleTypes: [StatementType.question],
		eligibleTypes: [StatementType.question],
		minRole: "admin",
		prerequisite: RoutePrerequisite.none,
	},
	{
		sourceApp: SourceApp.MASS_CONSENSUS,
		label: "Gather crowd consensus",
		description: "Let a large crowd suggest and rate answers anonymously",
		icon: "⚡",
		visibleTypes: [StatementType.question],
		eligibleTypes: [StatementType.question],
		minRole: "admin",
		prerequisite: RoutePrerequisite.markMassConsensus,
	},
	{
		sourceApp: SourceApp.SIGN,
		label: "Turn into a signable document",
		description: "Open this answer as a document people can read and sign",
		icon: "✍",
		visibleTypes: [StatementType.question, StatementType.option],
		eligibleTypes: [StatementType.option],
		minRole: "admin",
		prerequisite: RoutePrerequisite.markDocument,
		ineligibleReason: "Only answers (options) can become documents",
	},
];

export function getRouteTargetDef(sourceApp: SourceApp): RouteTargetDef | undefined {
	return ROUTE_REGISTRY.find((def) => def.sourceApp === sourceApp);
}
