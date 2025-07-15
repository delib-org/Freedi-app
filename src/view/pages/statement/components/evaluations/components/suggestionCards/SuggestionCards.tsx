import { FC, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
import { sortSubStatements } from '../../statementsEvaluationCont';
import SuggestionCard from './suggestionCard/SuggestionCard';
import styles from './SuggestionCards.module.scss';
import EmptyScreen from '../emptyScreen/EmptyScreen';
import { Statement, SortType, SelectionFunction, Role } from 'delib-npm';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	setStatement,
	statementOptionsSelector,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';

import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	propSort?: SortType;
	selectionFunction?: SelectionFunction;
	subStatements?: Statement[];
}

const SuggestionCards: FC<Props> = ({
	propSort,
	selectionFunction,
	subStatements: propSubStatements,
}) => {
	const { sort: _sort, statementId } = useParams();
	const dispatch = useDispatch();

	const sort = propSort || _sort || SortType.newest;
	const creator = useSelector(creatorSelector);
	const parentSubscription = useSelector(statementSubscriptionSelector(statementId));
	const statement = useSelector(statementSelector(statementId));
	const _subStatements = useSelector(statementOptionsSelector(statement?.statementId));

	const [totalHeight, setTotalHeight] = useState(0);
	const [isAnimating, setIsAnimating] = useState(false);

	// Memoized admin check
	const isAdmin = useMemo(() =>
		creator?.uid === parentSubscription?.statement?.creatorId ||
		parentSubscription?.role === Role.admin,
		[creator?.uid, parentSubscription?.statement?.creatorId, parentSubscription?.role]
	);

	// Memoized filtered statements
	const filteredSubStatements = useMemo(() => {
		const baseStatements = propSubStatements ||
			(selectionFunction
				? _subStatements.filter(sub => sub.evaluation.selectionFunction === selectionFunction)
				: _subStatements
			);

		return baseStatements?.filter(sub =>
			sub.hide !== true || sub.creatorId === creator?.uid || isAdmin
		) || [];
	}, [propSubStatements, _subStatements, selectionFunction, creator?.uid, isAdmin]);

	// Memoized sorted statements with optimized sorting
	const sortedSubStatements = useMemo(() => {
		if (!filteredSubStatements.length) return [];

		// Create a copy to avoid mutating the original array
		let sorted = [...filteredSubStatements];

		switch (sort) {
			case SortType.accepted:
				sorted = sorted.sort((a, b) => b.consensus - a.consensus);
				break;
			case SortType.newest:
				sorted = sorted.sort((a, b) => b.createdAt - a.createdAt);
				break;
			case SortType.random:
				sorted = sorted.sort(() => Math.random() - 0.5);
				break;
			case SortType.mostUpdated:
				sorted = sorted.sort((a, b) => b.lastUpdate - a.lastUpdate);
				break;
			default:
				break;
		}

		return sorted;
	}, [filteredSubStatements, sort]);

	// Memoized height calculation
	const calculatedHeight = useMemo(() => {
		return sortedSubStatements.reduce((acc, sub) =>
			acc + (sub.elementHight ?? 200) + 30, 0
		);
	}, [sortedSubStatements]);

	// Update total height with animation trigger
	useEffect(() => {
		if (calculatedHeight !== totalHeight) {
			setIsAnimating(true);
			setTotalHeight(calculatedHeight);

			// Reset animation state after transition
			const timer = setTimeout(() => setIsAnimating(false), 300);

			return () => clearTimeout(timer);
		}
	}, [calculatedHeight, totalHeight]);

	// Trigger sorting animation updates in Redux (for positioning)
	useEffect(() => {
		if (sortedSubStatements.length > 0) {
			sortSubStatements(sortedSubStatements, sort, 30);
		}
	}, [sortedSubStatements, sort]);

	// Load statement if needed
	useEffect(() => {
		if (!statement && statementId) {
			getStatementFromDB(statementId).then((statement: Statement) =>
				dispatch(setStatement(statement))
			);
		}
	}, [statement, statementId, dispatch]);

	// Listen to evaluations
	useEffect(() => {
		if (!statementId) return;

		const unsubscribe = listenToEvaluations(statementId);

		return unsubscribe;
	}, [statementId]);

	if (!filteredSubStatements.length) {
		return (
			<EmptyScreen
				setShowModal={() => {
					return;
				}}
			/>
		);
	}

	if (!statement) return null;

	return (
		<div
			className={`${styles['suggestions-wrapper']} ${isAnimating ? styles['animating'] : ''}`}
			style={{
				height: `${totalHeight + 60}px`,
				transition: isAnimating ? 'height 0.3s ease-in-out' : 'none'
			}}
		>
			{sortedSubStatements?.map((statementSub: Statement) => (
				<SuggestionCard
					key={statementSub.statementId}
					parentStatement={statement}
					siblingStatements={sortedSubStatements}
					statement={statementSub}
				/>
			))}
		</div>
	);
};

export default SuggestionCards;
