import React from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { setVotingSettingsToDB } from '@/controllers/db/vote/setVotingSettings';
import styles from './VotingSettings.module.scss';

const VotingSettings = () => {
	const { t } = useTranslation();
	const { statementId } = useParams();
	const statement = useSelector(statementSelectorById(statementId));

	if (!statement) return null;

	const showPercentage = statement.votingSettings?.showPercentages ?? false;

	function handleShowPercentageChange(checked: boolean) {
		setVotingSettingsToDB({
			statementId: statement.statementId,
			votingSettings: {
				...statement.votingSettings,
				showPercentages: checked,
			},
		});
		// Update the voting settings in the database or state management
		// For example:
		// updateVotingSettings(statement.statementId, { showPercentages: checked });
	}

	return (
		<div className={styles.votingSettings}>
			<Checkbox
				label={t('Show voting Percentages per option')}
				isChecked={showPercentage}
				onChange={handleShowPercentageChange}
			/>
		</div>
	);
};

export default VotingSettings;
