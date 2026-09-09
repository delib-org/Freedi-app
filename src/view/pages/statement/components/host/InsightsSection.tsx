import { FC, useMemo } from 'react';
import { Link } from 'react-router';
import { useSelector } from 'react-redux';
import { CalendarRange, FlaskConical } from 'lucide-react';
import { Statement, StatementType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useParticipationStats } from '@/controllers/hooks/useParticipationStats';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import ParticipationFunnel from '@/view/components/atomic/atoms/ParticipationFunnel/ParticipationFunnel';
import { useStatementView } from '../../hooks/useStatementView';
import styles from './HostHub.module.scss';

interface InsightsSectionProps {
	statement: Statement;
}

/** Participation funnel, research dashboard, and the event dashboard for spaces. */
const InsightsSection: FC<InsightsSectionProps> = ({ statement }) => {
	const { t } = useTranslation();
	const { setView } = useStatementView();
	const optionsSelect = useMemo(
		() => statementOptionsSelector(statement.statementId),
		[statement.statementId],
	);
	const options = useSelector(optionsSelect);
	const participation = useParticipationStats(statement, options);
	const isSpace = statement.statementType === StatementType.group;

	return (
		<div className={styles.liveGrid} data-testid="host-insights">
			<h3 className={styles.subheading}>{t('host.participation')}</h3>
			<div className={styles.funnel}>
				<ParticipationFunnel
					entered={participation.entered}
					suggested={participation.suggested}
					evaluated={participation.evaluated}
				/>
			</div>
			<div className={styles.row}>
				<button type="button" className={styles.linkButton} onClick={() => setView('research')}>
					<FlaskConical size={16} aria-hidden="true" />
					{t('host.researchDashboard')}
				</button>
				{isSpace && (
					<Link className={styles.linkButton} to={`/events/${statement.statementId}`}>
						<CalendarRange size={16} aria-hidden="true" />
						{t('host.eventDashboard')}
					</Link>
				)}
			</div>
		</div>
	);
};

export default InsightsSection;
