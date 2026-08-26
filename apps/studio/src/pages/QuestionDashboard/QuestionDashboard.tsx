import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ActivityType, type ScheduledAction } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { Skeleton } from '@/components/atomic/atoms/Skeleton';
import { ActivityBoard } from '@/components/atomic/molecules/ActivityBoard';
import { activityUrlResolver } from '@/config';
import { useScheduledActionsByTop } from '@/db/scheduledActions';
import { archiveStatement } from '@/db/statements';
import { useOrg } from '@/org/OrgContext';
import { logError } from '@/utils/logError';
import StudioPage from '@/pages/_shared/StudioPage';
import { useOnboarding } from '@/pages/_shared/useOnboarding';
import { useQuestionDashboardData } from './useQuestionDashboardData';
import { useStatusWithUndo } from './useStatusWithUndo';
import AddActivityModal from './components/AddActivityModal';
import ConfirmDialog from './components/ConfirmDialog';
import DashboardDrawer from './components/DashboardDrawer';
import EditQuestionModal from './components/EditQuestionModal';
import EditScheduledActionModal from './components/EditScheduledActionModal';
import EmptyActivities from './components/EmptyActivities';
import HomePreview from './components/HomePreview';
import PlanRatingCard, { hasRatedPlan } from './components/PlanRatingCard';
import QuestionHeader from './components/QuestionHeader';
import ScheduledTimeline from './components/ScheduledTimeline';
import SendUpdateModal from './components/SendUpdateModal';
import ShareModal from './components/ShareModal';
import { useStatusToast } from './components/StatusToast';
import styles from './QuestionDashboard.module.scss';

/**
 * QuestionDashboard — one top question: roll-up header, activity board,
 * facilitate drawer (`?activity=<id>`), and the add / share / update modals.
 * Route: /orgs/:orgId/questions/:qId
 */
type DashboardModal = 'add' | 'share' | 'update' | 'edit' | 'archiveQuestion' | null;

/** Onboarding milestones this page can complete. */
const ONBOARDING_FIRST_ACTIVITY = 2;
const ONBOARDING_SHARED = 3;

export default function QuestionDashboard() {
	const { orgId = '', qId = '' } = useParams<{ orgId: string; qId: string }>();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { t, tWithParams } = useTranslation();
	const { canManage } = useOrg();
	const onboarding = useOnboarding(orgId);
	const changeStatus = useStatusWithUndo();
	const { toast, show: showToast } = useStatusToast();
	const data = useQuestionDashboardData(qId);
	const { question, questionLoading, activities, activitiesLoading, progressById } = data;
	const { data: scheduled } = useScheduledActionsByTop(orgId, qId);

	const [modal, setModal] = useState<DashboardModal>(null);
	const [addType, setAddType] = useState<ActivityType | undefined>(undefined);
	const [archiveActivityId, setArchiveActivityId] = useState<string | null>(null);
	const [editAction, setEditAction] = useState<ScheduledAction | null>(null);

	// One-time AI plan rating, right after a build (`?rate=<sessionId>`).
	const rateSessionId = searchParams.get('rate');
	const showRating = Boolean(rateSessionId) && !hasRatedPlan(rateSessionId ?? '');
	const planHref = `/orgs/${orgId}/questions/${qId}/plan`;

	const selectedId = searchParams.get('activity') ?? undefined;
	const selected = activities.find((a) => a.statementId === selectedId);
	const orgHome = `/orgs/${orgId}`;

	const selectActivity = useCallback(
		(id: string | null) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (id) next.set('activity', id);
					else next.delete('activity');

					return next;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);

	const dismissRating = useCallback(() => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete('rate');

				return next;
			},
			{ replace: true },
		);
	}, [setSearchParams]);

	const openAdd = (type?: ActivityType) => {
		setAddType(type);
		setModal('add');
	};

	const handleQuickAction = async (id: string, action: 'open' | 'run') => {
		if (action === 'run') {
			navigate(`${orgHome}/questions/${qId}/run/${id}`);

			return;
		}
		const activity = activities.find((a) => a.statementId === id);
		if (!activity) return;
		try {
			await changeStatus(id, activity.runState, 'open');
		} catch (error) {
			logError(error, { operation: 'QuestionDashboard.quickOpen', statementId: id });
		}
	};

	const handleCreated = (statementId: string, type: ActivityType) => {
		if (activities.length === 0) onboarding.markStep(ONBOARDING_FIRST_ACTIVITY);
		setModal(null);
		if (type === ActivityType.massConsensus) {
			// The question exists under this top question; the full survey
			// (questions, demographics, logos…) is configured in Crowd survey,
			// which sends the consultant back to this drawer when saved.
			const returnTo = `${window.location.origin}/orgs/${orgId}/questions/${qId}?activity=${statementId}`;
			window.location.assign(
				activityUrlResolver.getNewSurveyLink({
					questionId: statementId,
					parentStatementId: qId,
					returnTo,
				}).href,
			);

			return;
		}
		selectActivity(statementId);
	};

	const handleArchiveQuestion = async () => {
		await archiveStatement(qId);
		navigate(orgHome);
	};

	const handleArchiveActivity = async () => {
		if (!archiveActivityId) return;
		await archiveStatement(archiveActivityId);
		setArchiveActivityId(null);
		showToast(t('Activity archived'));
	};

	const breadcrumb = [
		{ label: t('Questions'), to: orgHome },
		{ label: question?.statement || t('Question') },
	];

	if (!questionLoading && !question) {
		return (
			<StudioPage breadcrumb={breadcrumb}>
				<EmptyState
					variant="error"
					icon="🔍"
					title={t('Question not found')}
					text={t('It may have been archived, or you may not have access to it.')}
					action={<Button text={t('Back to questions')} onClick={() => navigate(orgHome)} />}
				/>
			</StudioPage>
		);
	}

	return (
		<StudioPage breadcrumb={breadcrumb}>
			<div className={styles.page}>
				{question ? (
					<QuestionHeader
						title={question.statement}
						description={question.description}
						rollup={data.rollup}
						totals={data.totals}
						lastActivityAt={
							data.totals.lastActivity || question.lastChildUpdate || question.lastUpdate
						}
						canManage={canManage}
						onAdd={() => openAdd()}
						onPlanWithAI={() => navigate(planHref)}
						onShare={() => setModal('share')}
						onSendUpdate={() => setModal('update')}
						onEdit={() => setModal('edit')}
						onArchive={() => setModal('archiveQuestion')}
					/>
				) : (
					<div className={styles.headerSkeleton} aria-busy="true">
						<Skeleton variant="title" width="60%" />
						<Skeleton variant="text" width="40%" />
					</div>
				)}

				{showRating && rateSessionId && (
					<PlanRatingCard sessionId={rateSessionId} onDone={dismissRating} />
				)}

				<div className={styles.content}>
					<div className={styles.main}>
						<ActivityBoard
							activities={activities}
							progressById={progressById}
							membersById={data.membersById}
							lastActivityById={data.lastActivityById}
							selectedId={selectedId}
							loading={activitiesLoading}
							readOnly={!canManage}
							onSelect={(id) => selectActivity(id)}
							onQuickAction={(id, action) => void handleQuickAction(id, action)}
							emptyState={
								<EmptyActivities
									canManage={canManage}
									onPickType={openAdd}
									onPlanWithAI={() => navigate(planHref)}
								/>
							}
						/>
						{(activities.length > 0 || scheduled.length > 0) && (
							<ScheduledTimeline
								actions={scheduled}
								activities={activities}
								questionId={qId}
								questionTitle={question?.statement ?? ''}
								canManage={canManage}
								onSelectActivity={(id) => selectActivity(id)}
								onEdit={setEditAction}
								onPlanWithAI={() => navigate(planHref)}
							/>
						)}
					</div>
					{activities.length > 0 && (
						<HomePreview title={question?.statement ?? ''} activities={activities} />
					)}
				</div>
			</div>

			{selected && (
				<DashboardDrawer
					orgId={orgId}
					qId={qId}
					activity={selected}
					activities={activities}
					progressById={progressById}
					scheduled={scheduled}
					canManage={canManage}
					onClose={() => selectActivity(null)}
					onArchiveRequest={(id) => {
						selectActivity(null);
						setArchiveActivityId(id);
					}}
				/>
			)}

			{canManage && (
				<>
					<AddActivityModal
						isOpen={modal === 'add'}
						orgId={orgId}
						qId={qId}
						initialType={addType}
						onClose={() => setModal(null)}
						onCreated={handleCreated}
					/>
					<ShareModal
						isOpen={modal === 'share'}
						qId={qId}
						questionTitle={question?.statement ?? ''}
						activities={activities}
						rollupState={data.rollup.state}
						hasJoin={data.hasJoin}
						onClose={() => setModal(null)}
						onShared={() => onboarding.markStep(ONBOARDING_SHARED)}
					/>
					<SendUpdateModal
						isOpen={modal === 'update'}
						qId={qId}
						totals={data.totals}
						lastNudgeAt={progressById[qId]?.lastNudgeAt}
						onClose={() => setModal(null)}
						onSent={(count) => {
							setModal(null);
							showToast(tWithParams('Sent to {{count}} people', { count }));
						}}
					/>
					{question && (
						<EditQuestionModal
							isOpen={modal === 'edit'}
							question={question}
							onClose={() => setModal(null)}
							onSaved={() => {
								setModal(null);
								showToast(t('Saved'));
							}}
						/>
					)}
					<EditScheduledActionModal
						isOpen={editAction !== null}
						action={editAction}
						onClose={() => setEditAction(null)}
						onSaved={() => {
							setEditAction(null);
							showToast(t('Saved'));
						}}
					/>
					<ConfirmDialog
						isOpen={modal === 'archiveQuestion'}
						title={t('Archive this question?')}
						text={t(
							'The question and all its activities will be hidden from participants and from this console.',
						)}
						confirmLabel={t('Archive question')}
						danger
						operation="QuestionDashboard.archiveQuestion"
						onConfirm={handleArchiveQuestion}
						onCancel={() => setModal(null)}
					/>
					<ConfirmDialog
						isOpen={archiveActivityId !== null}
						title={t('Archive this activity?')}
						text={t(
							'It will disappear from this dashboard and participants will no longer see it.',
						)}
						confirmLabel={t('Archive')}
						danger
						operation="QuestionDashboard.archiveActivity"
						onConfirm={handleArchiveActivity}
						onCancel={() => setArchiveActivityId(null)}
					/>
				</>
			)}

			{toast}
		</StudioPage>
	);
}
