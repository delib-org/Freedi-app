import { useEffect } from 'react';
import { useParams, useLocation } from 'react-router';
import styles from './MassConsensusMySuggestions.module.scss';

const MassConsensusMySuggestionsDebug = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const location = useLocation();

	useEffect(() => {
		console.log('MassConsensusMySuggestions mounted');
		console.log('Statement ID:', statementId);
		console.log('Location:', location);
		console.log('Pathname:', location.pathname);
	}, [statementId, location]);

	try {
		return (
			<div className={styles.container}>
				<div className={styles.header}>
					<h1 className={styles.title}>My Suggestions (Debug Version)</h1>
					<p>Statement ID: {statementId || 'No statement ID'}</p>
					<p>Current Path: {location.pathname}</p>
				</div>

				<div className={styles.content}>
					<div className={styles.emptyState}>
						<p>You have not created any suggestions yet.</p>
						<p className={styles.hint}>
							Your suggestions will appear here after you create them.
						</p>
					</div>
				</div>

				<div style={{ marginTop: '20px', padding: '20px', background: '#f0f0f0' }}>
					<h3>Debug Information:</h3>
					<pre>
						{JSON.stringify({
							statementId,
							pathname: location.pathname,
							search: location.search,
							hash: location.hash,
						}, null, 2)}
					</pre>
				</div>
			</div>
		);
	} catch (error) {
		console.error('Error in MassConsensusMySuggestionsDebug:', error);
		
return (
			<div style={{ padding: '20px', color: 'red' }}>
				<h2>Error in My Suggestions Component</h2>
				<pre>{error instanceof Error ? error.stack : String(error)}</pre>
			</div>
		);
	}
};

export default MassConsensusMySuggestionsDebug;