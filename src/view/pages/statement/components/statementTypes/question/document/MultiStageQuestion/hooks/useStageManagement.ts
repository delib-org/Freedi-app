import { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement, StatementType } from '@freedi/shared-types';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import {
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';

interface UseStageManagementProps {
	statement: Statement;
}

interface UseStageManagementReturn {
	initialStages: Statement[];
	topSuggestions: Statement[];
	showAddStage: boolean;
	setShowAddStage: (show: boolean) => void;
	handleAddSubQuestion: () => void;
	hasStages: boolean;
	hasTopSuggestions: boolean;
	imageUrl: string;
}

export const useStageManagement = ({
	statement,
}: UseStageManagementProps): UseStageManagementReturn => {
	const dispatch = useDispatch();
	const [showAddStage, setShowAddStage] = useState<boolean>(false);

	const statementsFromStore = useSelector(statementSubsSelector(statement?.statementId));

	const initialStages = useMemo(
		() =>
			statementsFromStore
				.filter((sub: Statement) => sub.statementType === StatementType.question)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[statementsFromStore],
	);

	const topSuggestions = statement.results || [];
	const imageUrl = statement.imagesURL?.main ?? '';
	const hasStages = initialStages?.length > 0;
	const hasTopSuggestions = topSuggestions?.length > 0;

	const handleAddSubQuestion = (): void => {
		if (statement) {
			dispatch(setParentStatement(statement));
			dispatch(setNewStatementType(StatementType.question));
			dispatch(setShowNewStatementModal(true));
		}
	};

	return {
		initialStages,
		topSuggestions,
		showAddStage,
		setShowAddStage,
		handleAddSubQuestion,
		hasStages,
		hasTopSuggestions,
		imageUrl,
	};
};
