import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { useOrgTopQuestions } from '@/db/orgStatements';
import {
	useOrgActivities,
	useQuestionProgressByTops,
	useStatementsByIds,
} from '@/db/orgActivities';
import { useQuestionProgressByOrg, type ProgressMap } from '@/db/progress';
import { Button, EmptyState } from '@/components/atomic/atoms';
import {
	QuestionCard,
	QuestionCardGrid,
	QuestionCardSkeleton,
} from '@/components/atomic/molecules/QuestionCard';
import StudioPage from '../_shared/StudioPage';
import { useOnboarding } from '../_shared/useOnboarding';
import { useOrganization } from '../_shared/useOrganization';
import { useQuestionRollups, type ActivityLabels } from './useQuestionRollups';
import NewQuestionModal from './NewQuestionModal';
import AddExistingQuestionModal from './AddExistingQuestionModal';
import OnboardingCard from './OnboardingCard';
import styles from './OrgQuestions.module.scss';

const SKELETON_COUNT = 3;

/** `/orgs/:orgId` — "Your questions": the org's top questions as cards. */
export default function OrgQuestions() {
	const { t, tWithParams } = useTranslation();
	const { orgId } = useParams<{ orgId: string }>();
	const navigate = useNavigate();
	const { user } = useAuth();
	const { currentOrg, canManage } = useOrg();
	const { data: fetchedOrg } = useOrganization(currentOrg ? null : orgId);
	const org = currentOrg ?? fetchedOrg;

	const questions = useOrgTopQuestions(orgId);
	const progress = useQuestionProgressByOrg(orgId);
	const onboarding = useOnboarding(orgId);

	// Linked questions: ones added from elsewhere. They carry no
	// `organizationId`, so neither the owned-questions query nor the org-wide
	// progress query finds them — both need a second, id-keyed pass.
	const activities = useOrgActivities(orgId);
	const ownedIds = useMemo(
		() => new Set(questions.data.map((question) => question.statementId)),
		[questions.data],
	);
	const linkedIds = useMemo(
		() =>
			activities.data
				.map((activity) => activity.statementId)
				.filter((statementId) => !ownedIds.has(statementId)),
		[activities.data, ownedIds],
	);
	const linkedQuestions = useStatementsByIds(linkedIds);
	const linkedProgress = useQuestionProgressByTops(linkedIds);

	const labels = useMemo<ActivityLabels>(
		() =>
			activities.data.reduce<ActivityLabels>((acc, activity) => {
				acc[activity.statementId] = { label: activity.label };

				return acc;
			}, {}),
		[activities.data],
	);
	const allQuestions = useMemo(
		() => [...questions.data, ...linkedQuestions.data],
		[questions.data, linkedQuestions.data],
	);
	const allProgress = useMemo<ProgressMap>(
		() => ({ ...progress.data, ...linkedProgress.data }),
		[progress.data, linkedProgress.data],
	);
	const rollups = useQuestionRollups(allQuestions, allProgress, labels);
	const onBoard = useMemo(
		() => new Set(allQuestions.map((question) => question.statementId)),
		[allQuestions],
	);

	const [showClosed, setShowClosed] = useState(false);
	const [showModal, setShowModal] = useState(false);
	const [showAddExisting, setShowAddExisting] = useState(false);

	const open = rollups.filter((r) => r.status !== 'closed');
	const closed = rollups.filter((r) => r.status === 'closed');
	const loading = questions.loading || activities.loading || linkedQuestions.loading;
	const isEmpty = !loading && rollups.length === 0;

	// A question already exists → step 1 is done whatever the stored state says.
	const { markStep } = onboarding;
	useEffect(() => {
		if (rollups.length > 0) markStep(1);
	}, [rollups.length, markStep]);

	const handleCreated = (statementId: string) => {
		markStep(1);
		setShowModal(false);
		navigate(`/orgs/${orgId}/questions/${statementId}`);
	};

	const handleLinked = (statementId: string) => {
		markStep(1);
		setShowAddExisting(false);
		navigate(`/orgs/${orgId}/questions/${statementId}`);
	};

	const cardTo = (questionId: string) => `/orgs/${orgId}/questions/${questionId}`;
	const startWithAI = () => navigate(`/orgs/${orgId}/plan/new`);

	return (
		<StudioPage
			breadcrumb={[{ label: t('Questions') }]}
			title={t('Your questions')}
			actions={
				canManage && !isEmpty ? (
					<>
						<Button text={`✨ ${t('Start with AI')}`} variant="primary" onClick={startWithAI} />
						<Button
							text={`+ ${t('New question')}`}
							variant="secondary"
							onClick={() => setShowModal(true)}
						/>
						<Button
							text={t('Add existing')}
							variant="secondary"
							onClick={() => setShowAddExisting(true)}
						/>
					</>
				) : undefined
			}
		>
			{loading && (
				<QuestionCardGrid>
					{Array.from({ length: SKELETON_COUNT }, (_, i) => (
						<QuestionCardSkeleton key={i} />
					))}
				</QuestionCardGrid>
			)}

			{questions.error && (
				<EmptyState variant="error" title={t('Could not load the questions.')} compact />
			)}

			{isEmpty && !questions.error && canManage && !onboarding.dismissed && (
				<OnboardingCard
					orgName={org?.name ?? ''}
					userName={user?.displayName?.split(' ')[0] ?? ''}
					step={onboarding.step}
					onStart={() => setShowModal(true)}
					onStartWithAI={startWithAI}
					onDismiss={onboarding.dismiss}
				/>
			)}

			{isEmpty && !questions.error && (!canManage || onboarding.dismissed) && (
				<EmptyState
					icon="❓"
					title={t('No questions yet')}
					text={
						canManage
							? t('Write the main question your participants will work on.')
							: t('Questions will appear here once an admin creates them.')
					}
					action={
						canManage ? (
							<Button text={`✨ ${t('Start with AI')}`} variant="primary" onClick={startWithAI} />
						) : undefined
					}
					secondary={
						canManage ? (
							<span className={styles.emptyLinks}>
								<button
									type="button"
									className="empty-state__link"
									onClick={() => setShowModal(true)}
								>
									{t('or write the question yourself')}
								</button>
								<button
									type="button"
									className="empty-state__link"
									onClick={() => setShowAddExisting(true)}
								>
									{t('or add one you already have')}
								</button>
							</span>
						) : undefined
					}
				/>
			)}

			{open.length > 0 && (
				<QuestionCardGrid>
					{open.map((r) => (
						<QuestionCard key={r.questionId} {...r} to={cardTo(r.questionId)} />
					))}
				</QuestionCardGrid>
			)}

			{closed.length > 0 && (
				<section className={styles.closed} aria-label={t('Closed questions')}>
					<Button
						text={
							showClosed
								? t('Hide closed questions')
								: tWithParams('Show closed questions ({{count}})', { count: closed.length })
						}
						variant="secondary"
						size="small"
						onClick={() => setShowClosed((v) => !v)}
						ariaLabel={
							showClosed
								? t('Hide closed questions')
								: tWithParams('Show closed questions ({{count}})', { count: closed.length })
						}
					/>
					{showClosed && (
						<QuestionCardGrid>
							{closed.map((r) => (
								<QuestionCard key={r.questionId} {...r} to={cardTo(r.questionId)} />
							))}
						</QuestionCardGrid>
					)}
				</section>
			)}

			{showModal && orgId && (
				<NewQuestionModal
					organizationId={orgId}
					onClose={() => setShowModal(false)}
					onCreated={handleCreated}
				/>
			)}

			{showAddExisting && orgId && user && (
				<AddExistingQuestionModal
					organizationId={orgId}
					userId={user.uid}
					alreadyOnBoard={onBoard}
					onClose={() => setShowAddExisting(false)}
					onLinked={handleLinked}
				/>
			)}
		</StudioPage>
	);
}
