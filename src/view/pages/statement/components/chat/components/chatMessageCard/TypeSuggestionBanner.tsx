import { FC, useState, useEffect, useCallback } from 'react';
import { Statement, StatementType } from '@freedi/shared-types';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import QuestionMarkIcon from '@/assets/icons/questionIcon.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import styles from './TypeSuggestionBanner.module.scss';

interface TypeSuggestionBannerProps {
	statement: Statement;
	suggestedType: StatementType.question | StatementType.option;
	isAuthorized: boolean;
	onDismiss: () => void;
}

const TypeSuggestionBanner: FC<TypeSuggestionBannerProps> = ({
	statement,
	suggestedType,
	isAuthorized,
	onDismiss,
}) => {
	const { t } = useTranslation();
	const [isLoading, setIsLoading] = useState(false);
	const [isExiting, setIsExiting] = useState(false);
	const [isReady, setIsReady] = useState(false);

	const isQuestion = suggestedType === StatementType.question;

	// Entrance delay
	useEffect(() => {
		const timer = setTimeout(() => setIsReady(true), 300);

		return () => clearTimeout(timer);
	}, []);

	const handleExit = useCallback((callback: () => void) => {
		setIsExiting(true);
		setTimeout(() => {
			callback();
		}, 200);
	}, []);

	const handleAccept = useCallback(async () => {
		if (isLoading) return;
		setIsLoading(true);

		try {
			const result = await changeStatementType(statement, suggestedType, isAuthorized);
			if (result.success) {
				handleExit(onDismiss);
			} else {
				setIsLoading(false);
				console.info('Type change failed:', result.error);
			}
		} catch (error) {
			setIsLoading(false);
			logError(error, {
				operation: 'TypeSuggestionBanner.handleAccept',
				metadata: { statementId: statement.statementId, suggestedType },
			});
		}
	}, [statement, suggestedType, isAuthorized, isLoading, onDismiss, handleExit]);

	const handleDismiss = useCallback(() => {
		handleExit(onDismiss);
	}, [onDismiss, handleExit]);

	if (!isReady) return null;

	const bannerClass = [
		styles.typeSuggestion,
		isQuestion ? styles['typeSuggestion--question'] : styles['typeSuggestion--option'],
		isExiting ? styles['typeSuggestion--exiting'] : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={bannerClass} role="status" aria-live="polite">
			<span className={styles.typeSuggestion__icon}>
				{isQuestion ? <QuestionMarkIcon /> : <LightBulbIcon />}
			</span>

			<span className={styles.typeSuggestion__text}>
				{isQuestion ? t('This looks like a question') : t('This looks like a solution')}
			</span>

			<button
				className={`${styles.typeSuggestion__accept} ${isQuestion ? styles['typeSuggestion__accept--question'] : styles['typeSuggestion__accept--option']}`}
				onClick={handleAccept}
				disabled={isLoading}
				type="button"
			>
				{isLoading ? (
					<span className={styles.typeSuggestion__spinner} />
				) : isQuestion ? (
					t('Convert to Question')
				) : (
					t('Convert to Solution')
				)}
			</button>

			<button
				className={styles.typeSuggestion__dismiss}
				onClick={handleDismiss}
				aria-label={t('Dismiss suggestion')}
				type="button"
			>
				&times;
			</button>
		</div>
	);
};

export default TypeSuggestionBanner;
