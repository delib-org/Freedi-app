import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deriveActivities, type ActivityRunState } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { StatusPill } from '@/components/atomic/atoms/StatusPill';
import { QRCodePanel } from '@/components/atomic/molecules/QRCodePanel';
import { StatusControl } from '@/components/atomic/molecules/StatusControl';
import { activityUrlResolver } from '@/config';
import { useChildren, useStatement } from '@/db/orgStatements';
import { useQuestionProgressByTop } from '@/db/progress';
import { useOrg } from '@/org/OrgContext';
import { logError } from '@/utils/logError';
import { useStatusWithUndo } from '@/pages/QuestionDashboard/useStatusWithUndo';
import FollowMeToggle from './components/FollowMeToggle';
import RunCounters from './components/RunCounters';
import { isFollowingActivity } from './db/followMe';
import styles from './RunView.module.scss';

/**
 * RunView — full-screen projector view for one activity: big QR + link,
 * status, live counters, "Follow me" and a way into Join's advanced controls.
 * Route: /orgs/:orgId/questions/:qId/run/:aId (no AppShell).
 */
const PROJECTOR_QR_SIZE = 480;

export default function RunView() {
	const {
		orgId = '',
		qId = '',
		aId = '',
	} = useParams<{ orgId: string; qId: string; aId: string }>();
	const { t } = useTranslation();
	const { canManage } = useOrg();
	const changeStatus = useStatusWithUndo();
	const [statusBusy, setStatusBusy] = useState(false);

	const { data: question } = useStatement(qId);
	const { data: children, loading } = useChildren(qId);
	const { data: progressById } = useQuestionProgressByTop(qId);

	const activity = useMemo(
		() => deriveActivities(children, activityUrlResolver).find((a) => a.statementId === aId),
		[children, aId],
	);

	const dashboardHref = `/orgs/${orgId}/questions/${qId}?activity=${aId}`;
	const hubLink = activityUrlResolver.getJoinHubLink(qId);
	const advancedHref = hubLink ? `${hubLink.href}/q/${aId}` : activity?.admin?.href;
	const following = isFollowingActivity(question?.joinFollowMe, aId);

	const handleStatusChange = async (next: ActivityRunState) => {
		if (!activity) return;
		setStatusBusy(true);
		try {
			await changeStatus(aId, activity.runState, next);
		} catch (error) {
			logError(error, { operation: 'RunView.statusChange', statementId: aId });
		} finally {
			setStatusBusy(false);
		}
	};

	const backLink = (
		<Link to={dashboardHref} className={styles.back}>
			<span className={styles.backArrow} aria-hidden="true">
				‹
			</span>
			{t('Back to dashboard')}
		</Link>
	);

	if (!loading && !activity) {
		return (
			<div className={styles.run}>
				<header className={styles.topbar}>{backLink}</header>
				<main className={styles.main}>
					<EmptyState
						variant="error"
						icon="🔍"
						title={t('Activity not found')}
						text={t('It may have been archived, or you may not have access to it.')}
					/>
				</main>
			</div>
		);
	}

	return (
		<div className={styles.run}>
			<header className={styles.topbar}>
				{backLink}
				<span className={styles.topbarTitle}>{question?.statement}</span>
			</header>

			<main className={styles.main}>
				<section className={styles.stage} aria-busy={loading || undefined}>
					<h1 className={styles.title} dir="auto">
						{activity?.title || t('Untitled')}
					</h1>
					{activity?.participant ? (
						<>
							<QRCodePanel
								url={activity.participant.href}
								title={activity.title}
								size={PROJECTOR_QR_SIZE}
							/>
							<p className={styles.hint}>{t('Tap the code to enlarge it')}</p>
						</>
					) : (
						!loading && <p className={styles.hint}>{t('No shareable activities yet.')}</p>
					)}
				</section>

				<aside className={styles.side}>
					<section className={styles.block}>
						<h2 className={styles.blockTitle}>{t('Status')}</h2>
						{activity &&
							(canManage ? (
								<StatusControl
									value={activity.runState}
									onChange={handleStatusChange}
									busy={statusBusy}
									compact
								/>
							) : (
								<StatusPill status={activity.runState} size="large" />
							))}
					</section>

					<section className={styles.block}>
						<h2 className={styles.blockTitle}>{t('Progress')}</h2>
						<RunCounters progress={progressById[aId]} />
					</section>

					{canManage && activity && (
						<section className={styles.block}>
							<FollowMeToggle topId={qId} activityId={aId} active={following} />
						</section>
					)}

					{advancedHref && (
						<section className={styles.block}>
							<a
								className={styles.advanced}
								href={advancedHref}
								target="_blank"
								rel="noopener noreferrer"
							>
								<Button text={t('Advanced controls')} variant="secondary" fullWidth />
							</a>
							<p className={styles.hint}>{t('Opens the live session in a new tab')}</p>
						</section>
					)}
				</aside>
			</main>
		</div>
	);
}
