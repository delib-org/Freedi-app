import { StatementType } from '@freedi/shared-types';

// Type restriction configuration for statement hierarchy
export const TYPE_RESTRICTIONS: Record<
	StatementType,
	{
		disallowedChildren?: StatementType[];
		reason?: string;
	}
> = {
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

export function isStatementTypeAllowedAsChildren(
	parentStatement: string | { statementType: StatementType },
	childType: StatementType,
): boolean {
	// Handle null/undefined gracefully
	if (!parentStatement) {
		return true;
	}

	// Handle 'top' case and string case
	if (parentStatement === 'top' || typeof parentStatement === 'string') {
		return true;
	}

	const parentType = parentStatement.statementType;
	const restrictions = TYPE_RESTRICTIONS[parentType];

	if (restrictions?.disallowedChildren?.includes(childType)) {
		// Log the restriction for debugging
		console.info(
			`Type restriction: Cannot create ${childType} under ${parentType}. ${restrictions.reason || ''}`,
		);

		return false;
	}

	return true;
}

// Enhanced validation function with detailed error messages
export function validateStatementTypeHierarchy(
	parentStatement: string | { statementType: StatementType },
	childType: StatementType,
): { allowed: boolean; reason?: string } {
	// Handle 'top' case and string case
	if (parentStatement === 'top' || typeof parentStatement === 'string') {
		return { allowed: true };
	}

	const parentType = parentStatement.statementType;
	const restrictions = TYPE_RESTRICTIONS[parentType];

	if (restrictions?.disallowedChildren?.includes(childType)) {
		return {
			allowed: false,
			reason: restrictions.reason || `Cannot create ${childType} under ${parentType}`,
		};
	}

	return { allowed: true };
}
