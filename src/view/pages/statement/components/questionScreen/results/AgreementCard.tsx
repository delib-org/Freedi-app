import { FC } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { buildStatementPath } from '@/routes/statementPaths';
import styles from '../QuestionScreen.module.scss';

interface AgreementCardProps {
	statement: Statement;
	decided: boolean;
}

/**
 * טיוטת הסכמה / ההסכמה שלנו — the lilac card leading into the full covenant
 * (drafting, Sign hand-off, votes between alternatives) as a Results sub-view.
 */
const AgreementCard: FC<AgreementCardProps> = ({ statement, decided }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();

	return (
		<section className={styles.agreement} data-testid="results-agreement">
			<h2 className={styles.agreement__title}>
				{decided ? t('Our agreement') : t('Draft agreement')}
			</h2>
			<p className={styles.agreement__body}>
				{decided
					? t('The wording was approved by the host.')
					: t(
							'Takes shape when the question moves to voting. The draft is built from the leading answers and can be edited.',
						)}
			</p>
			<button
				type="button"
				className={styles.agreement__button}
				onClick={() =>
					navigate(buildStatementPath({ statementId: statement.statementId, view: 'covenant' }))
				}
				data-testid="results-open-agreement"
			>
				{decided ? t('Read the full agreement') : t('Open the draft')}
			</button>
		</section>
	);
};

export default AgreementCard;
