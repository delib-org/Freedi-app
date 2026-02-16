import React, { FC, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';

import { Statement, Role } from '@freedi/shared-types';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	setStatement,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

import SuggestionCard from '../suggestionCards/suggestionCard/SuggestionCard';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import styles from './SimpleSuggestionCards.module.scss';

interface Props {
	subStatements?: Statement[];
}

const SimpleSuggestionCards: FC<Props> = ({ subStatements: propSubStatements }) => {
	const { statementId } = useParams();
	const dispatch = useDispatch();
	const statement = useSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));

	// Check if user is admin
	const isAdmin =
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin;

	// Filter statements based on visibility and permissions
	const visibleStatements =
		propSubStatements?.filter(
			(st) => st.hide !== true || st.creatorId === creator?.uid || isAdmin,
		) || [];

	const subStatements = visibleStatements;

	useEffect(() => {
		if (!statement && statementId)
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement)),
			);
	}, [statement, statementId, dispatch]);

	// Listen to evaluations
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [statementId]);

	if (!subStatements || subStatements.length === 0) {
		return <EmptyScreen statement={statement} />;
	}

	if (!statement) return null;

	return (
		<div className={styles['simple-suggestions-wrapper']}>
			{subStatements?.map((statementSub: Statement) => {
				return (
					<SuggestionCard
						key={statementSub.statementId}
						parentStatement={statement}
						statement={statementSub}
					/>
				);
			})}
		</div>
	);
};

export default SimpleSuggestionCards;
