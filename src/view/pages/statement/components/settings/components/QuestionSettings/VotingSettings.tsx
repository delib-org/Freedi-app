import React from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import Checkbox from '@/view/components/checkbox/Checkbox';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { setVotingSettingsToDB } from '@/controllers/db/vote/setVotingSettings';

const VotingSettings = () => {
    const { t } = useUserConfig();
    const {statementId} = useParams();
    const statement = useSelector(statementSelectorById(statementId));

    if (!statement) return null;

    const showPercentage = statement.votingSettings?.showPercentages ?? false;

    function handleShowPercentageChange(e) {
    
        console.log(e);
        setVotingSettingsToDB({
            statementId: statement.statementId,
            votingSettings: {
                ...statement.votingSettings,
                showPercentages: e,
            }
        });
        // Update the voting settings in the database or state management
        // For example:
        // updateVotingSettings(statement.statementId, { showPercentages: checked });
    }

  return (
    <div>
        <SectionTitle title={t('Voting Settings')} />
        <Checkbox label={t('Show voting Percentages per option')} isChecked={showPercentage} onChange={handleShowPercentageChange} />
    </div>
  )
}

export default VotingSettings