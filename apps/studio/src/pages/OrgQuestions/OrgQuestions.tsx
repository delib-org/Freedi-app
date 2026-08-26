import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { useOrgTopQuestions } from '@/db/orgStatements';
import { useQuestionProgressByOrg } from '@/db/progress';
import { Button, EmptyState } from '@/components/atomic/atoms';
import {
	QuestionCard,
	QuestionCardGrid,
	QuestionCardSkeleton,
} from '@/components/atomic/molecules/QuestionCard';
import StudioPage from '../_shared/StudioPage';
import { useOnboarding } from '../_shared/useOnboarding';
import { useOrganization } from '../_shared/useOrganization';
import { useQuestionRollups } from './useQuestionRollups';
import NewQuestionModal from './NewQuestionModal';
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
	const rollups = useQuestionRollups(questions.data, progress.data);
	const onboarding = useOnboarding(orgId);

	const [showClosed, setShowClosed] = useState(false);
	const [showModal, setShowModal] = useState(false);

	const open = rollups.filter((r) => r.status !== 'closed');
	const closed = rollups.filter((r) => r.status === 'closed');
	const loading = questions.loading;
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
							<button
								type="button"
								className="empty-state__link"
								onClick={() => setShowModal(true)}
							>
								{t('or write the question yourself')}
							</button>
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
		</StudioPage>
	);
}
