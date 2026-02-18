import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';

export const useStatementParams = () => {
	const { statementId, stageId, screen } = useParams<{
		statementId?: string;
		stageId?: string;
		screen?: string;
	}>();

	return useMemo(
		() => ({
			statementId,
			stageId,
			screen,
		}),
		[statementId, stageId, screen],
	);
};

export const useStatementSelectors = (statementId?: string, stageId?: string) => {
	const statement = useSelector(statementSelector(statementId));
	const stage = useSelector(statementSelector(stageId));
	const topParentStatement = useSelector(statementSelector(statement?.topParentId));
	const role = useSelector(statementSubscriptionSelector(statementId))?.role;

	return useMemo(
		() => ({
			statement,
			stage,
			topParentStatement,
			role,
		}),
		[statement, stage, topParentStatement, role],
	);
};
