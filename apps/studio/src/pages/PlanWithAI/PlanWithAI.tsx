import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import type { StudioPlanActivity } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Badge } from '@/components/atomic/atoms/Badge';
import { Button } from '@/components/atomic/atoms/Button';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { SegmentedControl } from '@/components/atomic/atoms/SegmentedControl';
import { Skeleton } from '@/components/atomic/atoms/Skeleton';
import {
	MEDIA_TABLET_AND_BELOW,
	useMediaQuery,
} from '@/components/atomic/organisms/AppShell/useMediaQuery';
import { useStatement } from '@/db/orgStatements';
import { useOrg } from '@/org/OrgContext';
import StudioPage from '@/pages/_shared/StudioPage';
import { useOnboarding } from '@/pages/_shared/useOnboarding';
import BuildBar from './components/BuildBar';
import PlanCard from './components/PlanCard';
import PlanChat, { type DraftSeed } from './components/PlanChat';
import { usePlanSession } from './usePlanSession';
import styles from './PlanWithAI.module.scss';

/**
 * PlanWithAI — "Start a question with AI": chat with the consultant on the
 * left, the live plan on the right, "Build it" underneath. A page rather
 * than a modal because the drawers/modals make `#root` inert.
 * Routes: /orgs/:orgId/plan/new · /orgs/:orgId/questions/:qId/plan (`?session=` resumes)
 */
type PlanTab = 'chat' | 'plan';

/** Onboarding milestones a build completes. */
const ONBOARDING_QUESTION = 1;
const ONBOARDING_FIRST_ACTIVITY = 2;

export default function PlanWithAI() {
	const { orgId = '', qId } = useParams<{ orgId: string; qId?: string }>();
	const navigate = useNavigate();
	const { t, tWithParams } = useTranslation();
	const { canManage, loading: orgLoading } = useOrg();
	const onboarding = useOnboarding(orgId);
	const isNarrow = useMediaQuery(MEDIA_TABLET_AND_BELOW);
	const existingMode = Boolean(qId);
	const { data: question } = useStatement(qId);

	const [tab, setTab] = useState<PlanTab>('chat');
	const [planDirty, setPlanDirty] = useState(false);
	const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null);

	const plan = usePlanSession({ orgId, qId, enabled: canManage && !orgLoading });
	const { phase, planVersion, builtHere, buildResult, sessionId } = plan;

	const orgHome = `/orgs/${orgId}`;
	const questionHref = (id: string) => `${orgHome}/questions/${id}`;

	// A plan change while the narrow layout shows the chat → pulse on "Plan".
	const seenVersionRef = useRef(0);
	useEffect(() => {
		if (planVersion <= seenVersionRef.current) return;
		seenVersionRef.current = planVersion;
		if (isNarrow && tab === 'chat') setPlanDirty(true);
	}, [planVersion, isNarrow, tab]);

	// Built here → mark onboarding and go to the new dashboard (with the rating card).
	const { markStep } = onboarding;
	useEffect(() => {
		if (!builtHere || !buildResult) return;
		markStep(ONBOARDING_QUESTION);
		if (Object.keys(buildResult.activityIds).length > 0) markStep(ONBOARDING_FIRST_ACTIVITY);
		const rate = sessionId ? `?rate=${encodeURIComponent(sessionId)}` : '';
		navigate(`/orgs/${orgId}/questions/${buildResult.topQuestionId}${rate}`, { replace: true });
	}, [builtHere, buildResult, sessionId, markStep, navigate, orgId]);

	const handleTab = (id: string) => {
		setTab(id === 'plan' ? 'plan' : 'chat');
		if (id === 'plan') setPlanDirty(false);
	};

	const handleAskToChange = useCallback((activity: StudioPlanActivity) => {
		setDraftSeed((prev) => ({
			text: `${activity.title ? `Change "${activity.title}": ` : ''}`,
			key: (prev?.key ?? 0) + 1,
		}));
		setTab('chat');
	}, []);

	const title = existingMode ? t('Plan with AI') : t('Start with AI');
	const breadcrumb = [
		{ label: t('Questions'), to: orgHome },
		...(existingMode && qId
			? [{ label: question?.statement || t('Question'), to: questionHref(qId) }]
			: []),
		{ label: title },
	];

	if (orgLoading) {
		return (
			<StudioPage breadcrumb={breadcrumb} title={title}>
				<div className={styles.page} aria-busy="true">
					<Skeleton variant="title" width="50%" />
					<Skeleton variant="card" />
				</div>
			</StudioPage>
		);
	}

	if (!canManage) {
		return (
			<StudioPage breadcrumb={breadcrumb} title={title}>
				<EmptyState
					icon="🔒"
					title={t('Only organization admins can plan with AI.')}
					action={<Button text={t('Back to questions')} onClick={() => navigate(orgHome)} />}
				/>
			</StudioPage>
		);
	}

	if (phase === 'error') {
		return (
			<StudioPage breadcrumb={breadcrumb} title={title}>
				<EmptyState
					variant="error"
					icon="⚠️"
					title={t('Could not start the consultant')}
					text={plan.error ?? undefined}
					action={<Button text={t('Back to questions')} onClick={() => navigate(orgHome)} />}
				/>
			</StudioPage>
		);
	}

	if (phase === 'built' && !builtHere) {
		const builtId = plan.session?.build?.topQuestionId ?? plan.session?.builtStatementId ?? qId;

		return (
			<StudioPage breadcrumb={breadcrumb} title={title}>
				<EmptyState
					icon="✅"
					title={t('This plan has already been built')}
					text={t('Open the question to see its activities and scheduled actions.')}
					action={
						builtId ? (
							<Button
								text={t('Open the question')}
								variant="primary"
								onClick={() => navigate(questionHref(builtId))}
							/>
						) : undefined
					}
				/>
			</StudioPage>
		);
	}

	const chat = (
		<PlanChat
			messages={plan.messages}
			phase={phase}
			waitingSince={plan.waitingSince}
			failedMessage={plan.failedMessage}
			error={plan.error}
			draftSeed={draftSeed}
			onSend={(text) => void plan.send(text)}
			onRetry={() => void plan.retry()}
		/>
	);

	const card = (
		<>
			<PlanCard
				plan={plan.plan}
				planVersion={planVersion}
				existingMode={existingMode}
				existingActivities={plan.existingActivities}
				changedTempIds={plan.changedTempIds}
				updating={phase === 'waiting'}
				onAskToChange={handleAskToChange}
			/>
			<BuildBar
				phase={phase}
				plan={plan.plan}
				readyToBuild={plan.readyToBuild}
				problems={plan.problems}
				existingMode={existingMode}
				buildError={plan.buildError}
				partialTopQuestionId={plan.session?.build?.topQuestionId}
				onBuild={() => void plan.build()}
				onOpenQuestion={(id) => navigate(questionHref(id))}
			/>
		</>
	);

	return (
		<StudioPage breadcrumb={breadcrumb} title={title}>
			<div className={styles.page}>
				{existingMode && (
					<p className={styles.context} dir="auto">
						{tWithParams('Planning for: {{title}}', {
							title: question?.statement || t('Question'),
						})}
					</p>
				)}

				{isNarrow && (
					<div className={styles.tabs}>
						<SegmentedControl
							segments={[
								{ id: 'chat', label: t('Chat') },
								{ id: 'plan', label: t('Plan') },
							]}
							activeId={tab}
							onChange={handleTab}
							ariaLabel={t('Chat or plan')}
						/>
						{planDirty && <Badge variant="notification" dot pulse ariaLabel={t('Plan updated')} />}
					</div>
				)}

				<div className={styles.layout}>
					<section
						className={clsx(styles.chatCol, isNarrow && tab !== 'chat' && styles.hidden)}
						aria-label={t('Chat')}
					>
						{chat}
					</section>
					<aside
						className={clsx(styles.planCol, isNarrow && tab !== 'plan' && styles.hidden)}
						aria-label={t('Plan')}
					>
						{card}
					</aside>
				</div>
			</div>
		</StudioPage>
	);
}
