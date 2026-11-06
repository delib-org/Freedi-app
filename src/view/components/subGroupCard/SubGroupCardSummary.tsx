import { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import {
	requestDiscussionSummary,
	SummarizationNotReadyError,
} from '@/controllers/db/summarization/summarizationController';
import { logError } from '@/utils/errorHandling';
import Text from '@/view/components/text/Text';
import styles from './SubGroupCardSummary.module.scss';

interface Props {
	statement: Statement;
	summary: string;
}

/**
 * The question's summary on its card. Admins get one button that rebuilds the
 * summary so it also covers what the group is divided on; the default summary
 * (selected options only) comes from the regular Summarize flow.
 */
const SubGroupCardSummary: FC<Props> = ({ statement, summary }) => {
	const { t } = useTranslation();
	const { isAdmin } = useEditPermission(statement);
	const [isLoading, setIsLoading] = useState(false);
	const [hasFailed, setHasFailed] = useState(false);

	const addDivided = async (): Promise<void> => {
		setIsLoading(true);
		setHasFailed(false);
		try {
			await requestDiscussionSummary(statement.statementId, undefined, { includeDivided: true });
		} catch (error) {
			if (!(error instanceof SummarizationNotReadyError)) {
				logError(error, {
					operation: 'SubGroupCardSummary.addDivided',
					statementId: statement.statementId,
				});
			}
			setHasFailed(true);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className={styles.summary}>
			<div className={styles.summary__text}>
				<Text description={summary} enableMarkdown={true} />
			</div>
			{isAdmin && (
				<button
					type="button"
					className={styles.summary__button}
					onClick={addDivided}
					disabled={isLoading}
				>
					{isLoading ? t('Generating...') : t('Add what the group is divided on')}
				</button>
			)}
			{hasFailed && (
				<p className={styles.summary__error} role="alert">
					{t('Could not update the summary')}
				</p>
			)}
		</div>
	);
};

export default SubGroupCardSummary;
