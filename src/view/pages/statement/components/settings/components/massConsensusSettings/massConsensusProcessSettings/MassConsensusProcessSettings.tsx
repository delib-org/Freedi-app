import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './MassConsensusProcessSettings.module.scss';
import ProcessSettingNative from './ProcessSetting/ProcessSettingNative';
import { useEffect } from 'react';
import { MassConsensusPageUrls, MassConsensusProcess } from 'delib-npm';
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { useSelector } from 'react-redux';
import { massConsensusProcessSelector } from '@/redux/massConsensus/massConsensusSlice';
import { useParams } from 'react-router';
import { listenToMassConsensusProcess } from '@/controllers/db/massConsensus/getMassConsensus';
import { selectUserDemographicQuestionsByStatementId } from '@/redux/userDemographic/userDemographicSlice';

const MassConsensusProcessSettings = () => {
    const { t } = useUserConfig();
    const { statementId } = useParams<{ statementId: string }>();

    const defaultMassConsensusProcesses: MassConsensusProcess = {
        statementId: statementId || '',
        version: '1.0',
        createdAt: Date.now(),
        createdBy: 'system',
        stages: defaultMassConsensusProcess,
    };

    const processList =
        useSelector(massConsensusProcessSelector(statementId!)) ||
        defaultMassConsensusProcesses;

    const userDemographicQuestions = useSelector(
        selectUserDemographicQuestionsByStatementId(statementId || '')
    );

    const stages = processList.stages.filter(stage => 
        userDemographicQuestions.length > 0 || stage.url !== MassConsensusPageUrls.userDemographics
    );

    useEffect(() => {
        if (!statementId) return;
        const unsubscribe = listenToMassConsensusProcess(statementId);

        return () => {
            unsubscribe();
        };
    }, [statementId]);

    return (
        <div className={styles.mcProcess}>
            <h3>{t('Mass Consensus Process Settings')}</h3>

            <ProcessSettingNative
                stages={stages}
                processName={t('Default Process for all users')}
            />
        </div>
    );
};

export default MassConsensusProcessSettings;
