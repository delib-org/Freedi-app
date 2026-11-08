import { FC } from 'react';
import { Role, Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import AISettings from '../settings/components/advancedSettings/AISettings';
import DiscussionSettings from '../settings/components/advancedSettings/DiscussionSettings';
import ModerationLog from '../settings/components/moderationLog/ModerationLog';
import advStyles from '../settings/components/advancedSettings/EnhancedAdvancedSettings.module.scss';
import { useHostSettings } from './useHostSettings';
import styles from './HostHub.module.scss';

const groupWrapClass = `${advStyles.enhancedSettings} ${advStyles.flatGroup}`;

interface AISectionProps {
	statement: Statement;
}

/** Similarity detection, submission-time checks, Popper-Hebbian mode, moderation log. */
const AISection: FC<AISectionProps> = ({ statement: propStatement }) => {
	const { statement, settings, handlers } = useHostSettings(propStatement);
	const subscription = useAppSelector(statementSubscriptionSelector(statement.statementId));
	const isAdminOrCreator = subscription?.role === Role.admin || subscription?.role === Role.creator;

	return (
		<div className={styles.liveGrid} data-testid="host-ai">
			<div className={groupWrapClass}>
				<AISettings
					statement={statement}
					settings={settings}
					handleSettingChange={handlers.handleSettingChange}
					part="ai"
				/>
				<DiscussionSettings
					statement={statement}
					settings={settings}
					handleSettingChange={handlers.handleSettingChange}
				/>
				{isAdminOrCreator && <ModerationLog statement={statement} />}
			</div>
		</div>
	);
};

export default AISection;
