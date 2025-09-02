import { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { Statement, StatementType } from 'delib-npm';
import { statementSelector, statementSubsSelector } from '@/redux/statements/statementsSlice';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { auth } from '@/controllers/db/config';
import styles from './MySuggestions.module.scss';

const MySuggestions: FC = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const allSuggestions = useSelector(statementSubsSelector(statementId));
	const [userSuggestions, setUserSuggestions] = useState<Statement[]>([]);
	const userId = auth.currentUser?.uid;

	useEffect(() => {
		if (!statementId) return;
		const unsubscribe = listenToSubStatements(statementId, 'top');
		
		return () => unsubscribe();
	}, [statementId]);

	useEffect(() => {
		if (!userId || !allSuggestions) return;
		
		const filteredSuggestions = allSuggestions.filter(
			(suggestion) => 
				suggestion.creatorId === userId && 
				suggestion.statementType === StatementType.option
		);
		
		setUserSuggestions(filteredSuggestions);
	}, [allSuggestions, userId]);

	if (!statement) {
		return <div className={styles.loading}>Loading...</div>;
	}

	return (
		<div className={styles.mySuggestions}>
			<div className={styles.header}>
				<h1>My Suggestions</h1>
				<h2>{statement.statement}</h2>
			</div>
			
			<div className={styles.suggestionsList}>
				{userSuggestions.length === 0 ? (
					<div className={styles.empty}>
						<p>You haven't submitted any suggestions yet.</p>
					</div>
				) : (
					userSuggestions.map((suggestion) => (
						<div key={suggestion.statementId} className={styles.suggestionCard}>
							<div className={styles.content}>
								<p>{suggestion.statement}</p>
							</div>
							<div className={styles.meta}>
								<span className={styles.type}>
									Suggestion
								</span>
								{suggestion.consensus !== undefined && (
									<span className={styles.consensus}>
										Consensus: {Math.round(suggestion.consensus)}%
									</span>
								)}
								<span className={styles.date}>
									{new Date(suggestion.createdAt).toLocaleDateString()}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
};

export default MySuggestions;