import { useMemo } from 'react';
import { Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useInheritedDemographics } from '@/controllers/hooks/userDemographic/useInheritedDemographics';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';

export interface JoinQuestionCounts {
	/** Questions a joiner is asked here: own ones plus inherited ones not skipped. */
	asked: number;
	/** Nothing declared or skipped here: the group's questions apply as they are. */
	isSameAsGroup: boolean;
}

/** Counts for the Questions on joining summary and the Entry check gate. */
export function useJoinQuestionCounts(statement: Statement): JoinQuestionCounts {
	const selectOwn = useMemo(
		() => selectUserDemographicQuestionsByStatementId(statement.statementId),
		[statement.statementId],
	);
	const own = useAppSelector(selectOwn);
	const { inheritedQuestions } = useInheritedDemographics({ statement });
	const isTopLevel = statement.parentId === 'top';
	const excluded = statement.statementSettings?.excludedInheritedDemographicIds ?? [];

	const inheritedAsked = isTopLevel
		? 0
		: inheritedQuestions.filter((q) => !excluded.includes(q.userQuestionId ?? '')).length;

	return {
		asked: own.length + inheritedAsked,
		isSameAsGroup:
			!isTopLevel && own.length === 0 && inheritedQuestions.length > 0 && excluded.length === 0,
	};
}
