import { StatementType } from '@freedi/shared-types';

interface CreatorNameSource {
	statementType: StatementType;
	creator?: { displayName?: string | null } | null;
}

/**
 * Returns the creator display name to show for a statement.
 *
 * Options (suggestions) are intentionally shown WITHOUT any author name so they
 * are judged on their content rather than on who proposed them. For every other
 * statement type the (already anonymized) creator pseudonym is returned.
 *
 * Accepts both `Statement` and `SimpleStatement` shapes.
 *
 * @param statement - The statement whose creator name should be displayed
 * @returns The display name, or an empty string for options / missing creators
 */
export function getCreatorDisplayName(statement: CreatorNameSource): string {
	if (statement.statementType === StatementType.option) return '';

	return statement.creator?.displayName ?? '';
}
