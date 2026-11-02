import { Access, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { translateCount } from '@/helpers/translateCount';
import { accessCopyKeys } from '@/helpers/peopleLabels';
import { isAccessInherited, resolveEffectiveAccess } from '@/helpers/effectiveAccess';
import {
	isStakeholderCountInherited,
	resolveInheritedStakeholders,
} from '@/helpers/stakeholderInheritance';
import { summaryLine } from './peopleLayout';
import { JoinQuestionCounts } from './useJoinQuestionCounts';

export interface PeopleSummaries {
	access: Access;
	join: string;
	questions: string;
	entryCheck: string;
	stakeholders: string;
	joining: string;
}

interface PeopleSummariesInput {
	statement: Statement;
	questionCounts: JoinQuestionCounts;
	toReviewCount: number;
}

/**
 * The live summary after each People subsection title (UX §6.1):
 * `value [· same as the group]`. Members builds its own (it knows the
 * Firestore total); Waiting and Entry check also carry a count badge.
 */
export function usePeopleSummaries({
	statement,
	questionCounts,
	toReviewCount,
}: PeopleSummariesInput): PeopleSummaries {
	const { t } = useTranslation();
	const parent = useAppSelector(statementSelector(statement.parentId));
	const topParent = useAppSelector(statementSelector(statement.topParentId));
	const isTopLevel = statement.parentId === 'top';
	const sameAsGroup = t('people.sameAsGroup');

	const access = resolveEffectiveAccess(statement, topParent);
	const isJoinInherited = !isTopLevel && isAccessInherited(statement);

	const declaredStakeholders = statement.evaluationSettings?.targetPopulation;
	const isStakeholdersInherited = isStakeholderCountInherited(statement);
	const stakeholderCount = isStakeholdersInherited
		? resolveInheritedStakeholders(parent, topParent).count
		: declaredStakeholders;

	return {
		access,
		join: summaryLine([t(accessCopyKeys(access).label), isJoinInherited && sameAsGroup]),
		questions: summaryLine([
			questionCounts.asked > 0
				? translateCount(t, 'people.summary.questions', questionCounts.asked)
				: t('No questions yet'),
			questionCounts.isSameAsGroup && sameAsGroup,
		]),
		entryCheck: translateCount(t, 'people.summary.toReview', toReviewCount),
		stakeholders: summaryLine([
			stakeholderCount ? stakeholderCount.toLocaleString() : t('people.notSetAnywhere'),
			isStakeholdersInherited && stakeholderCount !== undefined && sameAsGroup,
		]),
		joining: statement.statementSettings?.joiningEnabled ? t('On') : t('Off'),
	};
}
