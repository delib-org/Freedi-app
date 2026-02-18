import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectNewStatementShowModal } from '@/redux/statements/newStatementSlice';
import { QuestionType } from '@freedi/shared-types';
import { useStatementParams } from './useStatementSelectors';
import { useStatementSelectors } from './useStatementSelectors';
import { useUserDemographic } from './useUserDemographic';
import { useStatementUIState } from './useStatementUIState';

export const useStatementData = () => {
	// Get params
	const { statementId, stageId, screen } = useStatementParams();

	// Get statement data
	const { statement, stage, topParentStatement, role } = useStatementSelectors(
		statementId,
		stageId,
	);

	// Get user data - pass topParentId for group-level demographic questions
	const { userDemographicQuestions, userDemographic, showUserDemographicQuestions } =
		useUserDemographic(statementId || '', statement?.topParentId);

	// Get UI state
	const uiState = useStatementUIState();

	// Get additional selectors
	const showNewStatement = useSelector(selectNewStatementShowModal);

	// Computed values
	const isMassConsensus = useMemo(
		() => statement?.questionSettings?.questionType === QuestionType.massConsensus,
		[statement?.questionSettings?.questionType],
	);

	return {
		// Params
		statementId,
		stageId,
		screen,
		// Statements
		statement,
		stage,
		topParentStatement,
		// User data
		role,
		userDemographicQuestions,
		userDemographic,
		// UI state
		showNewStatement,
		showUserDemographicQuestions: showUserDemographicQuestions,
		isMassConsensus,
		// Spread UI state
		...uiState,
	};
};
