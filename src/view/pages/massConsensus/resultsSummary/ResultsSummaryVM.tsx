import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { listenToStatement, listenToSubStatements } from '@/controllers/db/statements/listenToStatements';

const useResultsSummary = () => {
	const { statementId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuthentication();
	const statement = useSelector(statementSelector(statementId));
	const subStatements = useSelector(statementSubsSelector(statementId)) || [];

	const [loadingStatements, setLoadingStatements] = useState(true);

	// Listen to statements and evaluations
	useEffect(() => {
		if (!statementId) return;

		setLoadingStatements(true);

		const unsubscribeStatement = listenToStatement(statementId);
		const unsubscribeStatements = listenToSubStatements(statementId);
		const unsubscribeEvaluations = listenToEvaluations(statementId);

		// Set loading to false after initial load
		const timer = setTimeout(() => {
			setLoadingStatements(false);
		}, 1000);

		return () => {
			clearTimeout(timer);
			unsubscribeStatement();
			unsubscribeStatements();
			unsubscribeEvaluations();
		};
	}, [statementId]);

	// Calculate total participants using useMemo
	const totalParticipants = statement?.evaluation?.asParentTotalEvaluators || 0;

	// Sort statements by consensus score using useMemo
	const sortedStatements = useMemo(() => {
		if (!subStatements || subStatements.length === 0) return [];

		return [...subStatements].sort((a, b) => {
			const aConsensus = a.consensus || 0;
			const bConsensus = b.consensus || 0;

			return bConsensus - aConsensus;
		});
	}, [subStatements]);

	// Filter user's statements using useMemo
	const userStatements = useMemo(() => {
		if (!user || !subStatements) return [];

		return subStatements.filter((stmt) => stmt.creatorId === user.uid);
	}, [subStatements, user?.uid]);

	const navigateToThankYou = () => {
		navigate(`/mass-consensus/${statementId}/leave-feedback`);
	};

	const navigateBack = () => {
		navigate(`/mass-consensus/${statementId}/voting`);
	};

	return {
		statement,
		sortedStatements,
		userStatements,
		loadingStatements,
		totalParticipants,
		navigateToThankYou,
		navigateBack,
	};
};

export default useResultsSummary;