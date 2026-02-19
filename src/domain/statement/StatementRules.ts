/**
 * StatementRules.ts - Pure business rules for statements.
 *
 * Contains type hierarchy restrictions and stage-to-evaluation-UI mapping.
 * All functions are pure (same input produces same output) with ZERO
 * imports from React, Firebase, or Redux.
 */

import { StatementType, StageSelectionType, EvaluationUI } from '@freedi/shared-types';

// ============================================================================
// TYPE HIERARCHY RULES
// ============================================================================

/** Configuration for which child types are disallowed under a given parent type. */
export interface TypeRestriction {
	disallowedChildren?: StatementType[];
	reason?: string;
}

/**
 * Type restriction configuration for the statement hierarchy.
 *
 * Defines which statement types cannot be nested under other types.
 * For example, options cannot contain other options, and groups cannot
 * contain options.
 */
export const TYPE_RESTRICTIONS: Record<StatementType, TypeRestriction> = {
	[StatementType.option]: {
		disallowedChildren: [StatementType.option],
		reason: 'Options cannot contain other options',
	},
	[StatementType.group]: {
		disallowedChildren: [StatementType.option],
		reason: 'Groups cannot contain options',
	},
	[StatementType.statement]: {},
	[StatementType.question]: {},
	[StatementType.document]: {},
	[StatementType.comment]: {},
	[StatementType.paragraph]: {},
};

/** Result of a type hierarchy validation check. */
export interface TypeHierarchyResult {
	allowed: boolean;
	reason?: string;
}

/**
 * Check whether a child type can be added under a given parent type.
 *
 * Returns an object with `allowed` (boolean) and an optional `reason`
 * string explaining why the child is disallowed.
 *
 * @param parentType - The statement type of the parent, or a string such as 'top'.
 * @param childType  - The statement type of the proposed child.
 * @returns Validation result with allowed flag and optional reason.
 */
export function canAddChild(
	parentType: StatementType | string,
	childType: StatementType,
): TypeHierarchyResult {
	// String parent types (e.g. 'top') have no restrictions
	if (typeof parentType === 'string' && !(Object.values(StatementType) as string[]).includes(parentType)) {
		return { allowed: true };
	}

	const restrictions = TYPE_RESTRICTIONS[parentType as StatementType];
	if (restrictions?.disallowedChildren?.includes(childType)) {
		return {
			allowed: false,
			reason: restrictions.reason || `Cannot create ${childType} under ${parentType}`,
		};
	}

	return { allowed: true };
}

/**
 * Boolean check for whether a child type is allowed under a parent statement.
 *
 * This is a convenience wrapper that accepts the same parent shapes used
 * throughout the codebase: a full statement object, the literal string
 * `'top'`, or any other string.
 *
 * @param parentStatement - The parent statement (object with statementType) or a string.
 * @param childType       - The proposed child statement type.
 * @returns `true` if the child type is allowed.
 */
export function isChildTypeAllowed(
	parentStatement: string | { statementType: StatementType },
	childType: StatementType,
): boolean {
	if (!parentStatement) return true;

	if (typeof parentStatement === 'string') {
		return canAddChild(parentStatement, childType).allowed;
	}

	return canAddChild(parentStatement.statementType, childType).allowed;
}

// ============================================================================
// STAGE SELECTION TO EVALUATION UI MAPPING
// ============================================================================

/**
 * Registry mapping stage selection types to their corresponding evaluation UI.
 *
 * This follows the Open-Closed Principle: to add a new stage type, simply
 * add a new entry to this record rather than modifying a switch statement.
 */
const STAGE_TO_EVALUATION_UI: Record<StageSelectionType, EvaluationUI> = {
	[StageSelectionType.consensus]: EvaluationUI.suggestions,
	[StageSelectionType.voting]: EvaluationUI.voting,
	[StageSelectionType.checkbox]: EvaluationUI.checkbox,
};

/**
 * Get the appropriate evaluation UI for a given stage selection type.
 *
 * @param stageType - The stage selection type, or undefined.
 * @returns The matching EvaluationUI, defaulting to `EvaluationUI.suggestions`.
 */
export function getEvaluationUIForStage(stageType?: StageSelectionType): EvaluationUI {
	if (!stageType) return EvaluationUI.suggestions;

	return STAGE_TO_EVALUATION_UI[stageType] ?? EvaluationUI.suggestions;
}
