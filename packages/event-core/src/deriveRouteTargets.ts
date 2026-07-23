import {
	QuestionType,
	ROUTE_REGISTRY,
	RoutePrerequisite,
	StatementType,
	type RouteTargetDef,
	type Statement,
} from '@freedi/shared-types';
import type { ActivityUrlResolver } from './activityUrls';

/**
 * Cross-App Statement Router — target derivation (framework-agnostic).
 *
 * Sibling of `deriveActivities`: a pure function that turns one Statement +
 * the caller's role into the destination list the Route Picker renders.
 * No writes, no I/O — prerequisite writes (Sign's `isDocument`, MC's
 * `questionType`) are executed by the consuming app when the user confirms.
 */

export type RouteTargetState = 'ready' | 'needsMark' | 'alreadyMarked' | 'disabled';

export interface RouteTarget {
	def: RouteTargetDef;
	/** Absolute URL into the destination app, or null when unresolvable. */
	href: string | null;
	/** True when the link leaves the main app (opens in a new tab). */
	external: boolean;
	state: RouteTargetState;
	/** English key for `t()`; present only when state === 'disabled'. */
	disabledReason?: string;
}

export interface RouteTargetContext {
	/** True when the user is an admin or the creator of the relevant scope. */
	isAdmin: boolean;
}

const NO_URL_REASON = 'Not available in this environment';

function isVisible(def: RouteTargetDef, statementType: StatementType): boolean {
	return def.visibleTypes.includes(statementType);
}

function isEligible(def: RouteTargetDef, statement: Statement): boolean {
	const statementType = statement.statementType as StatementType;
	if (!def.eligibleTypes.includes(statementType)) return false;

	if (statementType === StatementType.question && def.eligibleQuestionTypes) {
		const questionType = statement.questionSettings?.questionType ?? QuestionType.simple;

		return def.eligibleQuestionTypes.includes(questionType);
	}

	return true;
}

function prerequisiteState(def: RouteTargetDef, statement: Statement): RouteTargetState {
	switch (def.prerequisite) {
		case RoutePrerequisite.markDocument:
			return statement.isDocument === true ? 'alreadyMarked' : 'needsMark';
		case RoutePrerequisite.markMassConsensus:
			return statement.questionSettings?.questionType === QuestionType.massConsensus
				? 'alreadyMarked'
				: 'needsMark';
		case RoutePrerequisite.none:
		default:
			return 'ready';
	}
}

function toRouteTarget(
	def: RouteTargetDef,
	statement: Statement,
	resolver: ActivityUrlResolver,
): RouteTarget {
	const link = resolver.getRouteLink(def.sourceApp, statement.statementId);

	if (!isEligible(def, statement)) {
		return {
			def,
			href: null,
			external: true,
			state: 'disabled',
			disabledReason: def.ineligibleReason ?? NO_URL_REASON,
		};
	}

	if (!link) {
		return { def, href: null, external: true, state: 'disabled', disabledReason: NO_URL_REASON };
	}

	return {
		def,
		href: link.href,
		external: link.external,
		state: prerequisiteState(def, statement),
	};
}

/**
 * Derive the Route Picker's destination list for one Statement.
 *
 * - Below `minRole` → target omitted entirely (entry point stays hidden).
 * - Statement type not in `visibleTypes` → omitted (truly inapplicable).
 * - Visible but not eligible → disabled with `ineligibleReason` (teaches the model).
 * - No resolvable URL → disabled with "Not available in this environment".
 * - Prerequisite write pending → `needsMark`; already satisfied → `alreadyMarked`.
 */
export function deriveRouteTargets(
	statement: Statement,
	resolver: ActivityUrlResolver,
	ctx: RouteTargetContext,
): RouteTarget[] {
	const statementType = statement.statementType as StatementType;

	return ROUTE_REGISTRY.filter((def) => {
		if (def.minRole === 'admin' && !ctx.isAdmin) return false;

		return isVisible(def, statementType);
	}).map((def) => toRouteTarget(def, statement, resolver));
}
