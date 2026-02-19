import { createSelector } from '@reduxjs/toolkit';
import { StatementSubscription, StatementType } from '@freedi/shared-types';
import {
	createStatementByIdSelector,
	createStatementsByParentSelector,
	createStatementsByParentAndTypeSelector,
	createFilteredStatementsSelector,
	sortByCreatedAt,
} from '../utils/selectorFactories';
import { StatementScreen } from './statementsSlice';

// Define a type for the statements state shape used by selectors
interface StatementsState {
	statements: import('@freedi/shared-types').Statement[];
	statementSubscription: StatementSubscription[];
	statementSubscriptionLastUpdate: number;
	statementMembership: StatementSubscription[];
	screen: StatementScreen;
}

// statements
export const totalMessageBoxesSelector = (state: { statements: StatementsState }) =>
	state.statements.statements.length;

export const screenSelector = (state: { statements: StatementsState }) => state.statements.screen;

export const statementSelectorById =
	(statementId: string | undefined) => (state: { statements: StatementsState }) => {
		return state.statements.statements.find((statement) => statement.statementId === statementId);
	};

export const statementsSelector = (state: { statements: StatementsState }) =>
	state.statements.statements;

// Memoized selector for statement by ID - use when you need to subscribe to updates
export const makeStatementByIdSelector = createStatementByIdSelector(statementsSelector);

const selectFilteredStatements = createFilteredStatementsSelector(statementsSelector);
export const subStatementsByTopParentIdMemo = (statementId: string | undefined) =>
	selectFilteredStatements(
		(statement) =>
			statement.topParentId === statementId && statement.statementType !== StatementType.document,
	);

export const statementDescendantsSelector = (statementId: string) =>
	createSelector(
		(state: { statements: StatementsState }) => state.statements.statements,
		(statements) => statements.filter((statement) => statement.parents?.includes(statementId)),
	);

export const statementsRoomSolutions =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId && statement.statementType === StatementType.option,
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementsSubscriptionsSelector = createSelector(
	(state: { statements: StatementsState }) => state.statements.statementSubscription,
	(statementSubscription) => [...statementSubscription].sort((a, b) => b.lastUpdate - a.lastUpdate),
);

export const statementSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId);

export const topSubscriptionsSelector = createSelector(
	(state: { statements: StatementsState }) => state.statements.statementSubscription,
	(statementSubscription) =>
		statementSubscription
			.filter((sub: StatementSubscription) => sub.statement.parentId === 'top')
			.sort((a, b) => b.lastUpdate - a.lastUpdate),
);

const selectStatements = (state: { statements: StatementsState }) => state.statements.statements;

// Memoized selector - removed .map() that was breaking memoization
const selectStatementsByParent = createStatementsByParentSelector(selectStatements);
export const statementSubsSelector = selectStatementsByParent;

// Memoized selector - removed .map() that was breaking memoization
const selectStatementsByParentAndType = createStatementsByParentAndTypeSelector(statementsSelector);
export const statementOptionsSelector = (statementId: string | undefined) =>
	selectStatementsByParentAndType(statementId, StatementType.option);

export const questionsSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements
			.filter(
				(statement) =>
					statement.parentId === statementId && statement.statementType === StatementType.question,
			)
			.sort((a, b) => a.createdAt - b.createdAt);

export const statementSubscriptionSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statementSubscription.find(
			(statementSub) => statementSub.statementId === statementId,
		) || undefined;

export const statementOrderSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId)?.order ||
		0;

export const statementElementHightSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statements.find((statement) => statement.statementId === statementId)
			?.elementHight || 0;

export const lastUpdateStatementSubscriptionSelector = (state: { statements: StatementsState }) =>
	state.statements.statementSubscriptionLastUpdate;

// Membership
export const statementMembershipSelector =
	(statementId: string | undefined) => (state: { statements: StatementsState }) =>
		state.statements.statementMembership.filter(
			(statement: StatementSubscription) => statement.statementId === statementId,
		);

export const hasTokenSelector =
	(token: string, statementId: string | undefined) => (state: { statements: StatementsState }) => {
		const subscription = state.statements.statementSubscription.find(
			(statement) => statement.statementId === statementId,
		);

		return subscription?.tokens?.includes(token) || false;
	};

export const subscriptionParentStatementSelector = (parentId: string) =>
	createSelector(
		(state: { statements: StatementsState }) => state.statements.statementSubscription,
		(statementSubscription) =>
			statementSubscription.filter((sub) => sub.statement.topParentId === parentId),
	);

const selectMultiStepFiltered = createFilteredStatementsSelector(statementsSelector);
export const statementsOfMultiStepSelectorByStatementId = (statementId: string | undefined) =>
	selectMultiStepFiltered((st) => st.isInMultiStage === true && st.parentId === statementId);

const selectUserSuggestionsFiltered = createFilteredStatementsSelector(statementsSelector);
export const userSuggestionsSelector = (parentId: string | undefined, userId: string | undefined) =>
	selectUserSuggestionsFiltered(
		(statement) =>
			statement.parentId === parentId &&
			statement.creatorId === userId &&
			statement.statementType === StatementType.option,
		sortByCreatedAt,
	);
