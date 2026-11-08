import { useMemo } from 'react';
import { Statement, UserDemographicQuestion } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useInheritedDemographics } from '@/controllers/hooks/userDemographic/useInheritedDemographics';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';

export interface JoinQuestionCounts {
	/** Questions a joiner is asked here: own ones plus inherited ones not skipped. */
	asked: number;
	/** Nothing declared or skipped here: the group's questions apply as they are. */
	isSameAsGroup: boolean;
	/** The inherited questions still asked here (not skipped), for the Entry check. */
	inheritedAsked: UserDemographicQuestion[];
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

	const excludedKey = excluded.join(',');
	const inheritedAsked = useMemo(() => {
		if (isTopLevel) return [];
		const skipped = new Set(excludedKey.split(','));

		return inheritedQuestions.filter((q) => !skipped.has(q.userQuestionId ?? ''));
	}, [isTopLevel, inheritedQuestions, excludedKey]);

	return {
		asked: own.length + inheritedAsked.length,
		inheritedAsked,
		isSameAsGroup:
			!isTopLevel && own.length === 0 && inheritedQuestions.length > 0 && excluded.length === 0,
	};
}
