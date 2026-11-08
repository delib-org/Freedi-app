import { FC } from 'react';
import { Statement, StatementType } from '@freedi/shared-types';
import AISettings from '../settings/components/advancedSettings/AISettings';
import SynthesisPanel from '../settings/components/synthesisPanel/SynthesisPanel';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import { useHostSettings } from './useHostSettings';
import styles from './HostHub.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface ClusteringSectionProps {
	statement: Statement;
}

/** Merging duplicates (grouping + live synthesis), the cluster map, and the synthesis runs. */
const ClusteringSection: FC<ClusteringSectionProps> = ({ statement: propStatement }) => {
	const { statement, settings, handlers } = useHostSettings(propStatement);
	const isQuestion = statement.statementType === StatementType.question;

	return (
		<div className={styles.liveGrid} data-testid="host-clustering">
			<div className={groupWrapClass}>
				<AISettings
					statement={statement}
					settings={settings}
					handleSettingChange={handlers.handleSettingChange}
					part="clustering"
				/>
				{isQuestion && <SynthesisPanel statement={statement} />}
			</div>
		</div>
	);
};

export default ClusteringSection;
