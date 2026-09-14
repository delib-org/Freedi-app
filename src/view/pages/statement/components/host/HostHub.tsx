import { FC, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3, Layers, Radio, Settings, Users, LineChart } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { uxAnalytics } from '@/services/analytics';
import Loader from '@/view/components/loaders/Loader';
import { useStatementView } from '../../hooks/useStatementView';
import { useStatementSettingsData } from '../settings/useStatementSettingsData';
import HostHubCard from './HostHubCard';
import LiveNowCard from './LiveNowCard';
import PeopleSection from './PeopleSection';
import AnswersSection from './AnswersSection';
import ResultsSection from './ResultsSection';
import HubSettingsSection from './HubSettingsSection';
import InsightsSection from './InsightsSection';
import { buildHostHubPath, HostHubSectionId, parseHostHubSection } from './hostHubLogic';
import styles from './HostHub.module.scss';

/**
 * The host's home for one question: six cards (Live now, People, Answers,
 * Results, Settings, Insights). Rendered for the `settings` view under the
 * new shell; `?section=` deep-links and expands one card. Only reached by
 * hosts — SwitchScreen drops the view for everyone else.
 */
const HostHub: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statementId, rest } = useStatementView();
	const { statementToEdit, setStatementToEdit, parentStatement } =
		useStatementSettingsData(statementId);
	const requested = parseHostHubSection(rest);
	const [expanded, setExpanded] = useState<Set<HostHubSectionId>>(() => new Set([requested]));

	// A change of ?section= (deep link, host chip) opens that card and scrolls to it.
	useEffect(() => {
		setExpanded((prev) => (prev.has(requested) ? prev : new Set(prev).add(requested)));
		if (statementId) uxAnalytics.hostHubOpened(statementId, requested);
		const target = document.getElementById(`host-hub-${requested}`);
		target?.scrollIntoView({ block: 'start' });
	}, [requested, statementId]);

	const toggle = useCallback(
		(id: HostHubSectionId) => {
			const opening = !expanded.has(id);
			const next = new Set(expanded);
			if (opening) next.add(id);
			else next.delete(id);
			setExpanded(next);
			// Only opening selects a section in the URL; selecting a just-closed
			// section would make the deep-link effect immediately reopen it.
			if (opening && statementId) {
				uxAnalytics.hostHubOpened(statementId, id);
				navigate(buildHostHubPath(statementId, id), { replace: true });
			}
		},
		[expanded, navigate, statementId],
	);

	if (!statementToEdit) {
		return (
			<div className="center">
				<Loader />
			</div>
		);
	}

	return (
		<div className={styles.root} data-testid="host-hub">
			<header className={styles.header}>
				<h1 className={styles.title}>{t('host.title')}</h1>
				<p className={styles.caption}>{t('host.caption')}</p>
			</header>

			<HostHubCard
				id="live"
				title={t('host.live')}
				description={t('host.liveDesc')}
				icon={Radio}
				expanded={expanded.has('live')}
				onToggle={toggle}
			>
				<LiveNowCard statement={statementToEdit} />
			</HostHubCard>

			<HostHubCard
				id="people"
				title={t('host.people')}
				description={t('host.peopleDesc')}
				icon={Users}
				expanded={expanded.has('people')}
				onToggle={toggle}
			>
				<PeopleSection statement={statementToEdit} setStatementToEdit={setStatementToEdit} />
			</HostHubCard>

			<HostHubCard
				id="answers"
				title={t('host.answers')}
				description={t('host.answersDesc')}
				icon={Layers}
				expanded={expanded.has('answers')}
				onToggle={toggle}
			>
				<AnswersSection statement={statementToEdit} />
			</HostHubCard>

			<HostHubCard
				id="results"
				title={t('host.results')}
				description={t('host.resultsDesc')}
				icon={BarChart3}
				expanded={expanded.has('results')}
				onToggle={toggle}
			>
				<ResultsSection statement={statementToEdit} setStatementToEdit={setStatementToEdit} />
			</HostHubCard>

			<HostHubCard
				id="settings"
				title={t('host.settings')}
				description={t('host.settingsDesc')}
				icon={Settings}
				expanded={expanded.has('settings')}
				onToggle={toggle}
			>
				<HubSettingsSection
					statement={statementToEdit}
					parentStatement={parentStatement}
					setStatementToEdit={setStatementToEdit}
				/>
			</HostHubCard>

			<HostHubCard
				id="insights"
				title={t('host.insights')}
				description={t('host.insightsDesc')}
				icon={LineChart}
				expanded={expanded.has('insights')}
				onToggle={toggle}
			>
				<InsightsSection statement={statementToEdit} />
			</HostHubCard>
		</div>
	);
};

export default HostHub;
