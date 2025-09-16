import { useParams } from 'react-router';
import styles from './MassConsensusMySuggestions.module.scss';

const MassConsensusMySuggestionsSimple = () => {
	const { statementId } = useParams<{ statementId: string }>();

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h1 className={styles.title}>My Suggestions</h1>
				<p>Statement ID: {statementId}</p>
			</div>

			<div className={styles.content}>
				<div className={styles.emptyState}>
					<p>You have not created any suggestions yet.</p>
					<p className={styles.hint}>
						Your suggestions will appear here after you create them.
					</p>
				</div>
			</div>
		</div>
	);
};

export default MassConsensusMySuggestionsSimple;