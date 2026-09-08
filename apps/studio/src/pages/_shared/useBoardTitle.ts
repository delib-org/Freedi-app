import { useOrgActivity } from '@/db/orgActivities';
import { useStatement } from '@/db/orgStatements';

/**
 * What this organization calls a question.
 *
 * A linked question carries a board name that only this organization sees, and
 * every screen that names the question has to agree — otherwise a question is
 * called one thing on its dashboard and another in the trail above it.
 */
export function useBoardTitle(
	organizationId: string | null | undefined,
	statementId: string | null | undefined,
): string {
	const { data: activity } = useOrgActivity(organizationId, statementId);
	const { data: question } = useStatement(statementId);

	return activity?.label?.trim() || question?.statement || '';
}
