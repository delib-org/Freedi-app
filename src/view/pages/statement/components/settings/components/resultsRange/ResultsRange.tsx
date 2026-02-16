import { FC } from 'react';

import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './ResultsRange.module.scss';
import { defaultResultsSettings } from '@freedi/shared-types';

const ResultsRange: FC<StatementSettingsProps> = ({ statement, setStatementToEdit }) => {
	const { t } = useTranslation();
	const resultsSettings = statement.resultsSettings ?? defaultResultsSettings;

	const title = `${t('Number of Results to Display')}: `;

	return (
		<section className={styles.resultsRange}>
			<div className="title">{title}</div>
			<div className={styles.rangeBox}>
				<input
					className={styles.range}
					type="range"
					aria-label="Number Of Results"
					name="numberOfResults"
					value={resultsSettings.numberOfResults}
					min="1"
					max="10"
					onChange={(e) => {
						setStatementToEdit({
							...statement,
							resultsSettings: {
								...resultsSettings,
								numberOfResults: Number(e.target.value),
							},
						});
					}}
				/>
				<span className={styles.numberOfResults}>{resultsSettings.numberOfResults}</span>
			</div>
		</section>
	);
};

export default ResultsRange;
