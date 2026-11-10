import { useContext, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import SuggestionCards from '../../evaluations/components/suggestionCards/SuggestionCards';
import styles from './StagePage.module.scss';
import StatementBottomNav from '../../nav/bottom/StatementBottomNav';
import StatementVote from '../../vote/StatementVote';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementContext } from '../../../StatementCont';
import { Statement, EvaluationUI } from '@freedi/shared-types';
import Clustering from '../../clustering/Clustering';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { Lightbulb, Plus, MessageSquare } from 'lucide-react';

interface Props {
	showBottomNav?: boolean;
	/** False hides the add steps of the empty state; the person can only wait for answers. */
	canAddAnswer?: boolean;
}

const StagePage = ({ showBottomNav = true, canAddAnswer = true }: Props) => {
	const { statement } = useContext(StatementContext);
	const stageRef = useRef<HTMLDivElement>(null);
	const optionsSelect = useMemo(
		() => statementOptionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const options = useSelector(optionsSelect);
	const hasAnswers = options.length > 0;

	useEffect(() => {
		const updateHeight = () => {
			if (stageRef.current) {
				const topPosition = stageRef.current.getBoundingClientRect().top;
				const viewportHeight = window.innerHeight;
				const newHeight = viewportHeight - topPosition;
				stageRef.current.style.height = `${newHeight + 300}px`;
			}
		};

		// Initial height calculation
		updateHeight();

		// Update height on window resize
		window.addEventListener('resize', updateHeight);

		return () => {
			window.removeEventListener('resize', updateHeight);
		};
	}, []);

	// The "Stage: …" heading used to render here. It read its title from
	// StatementContext — the same context StatementHeader renders as the page
	// <h1> — so it was always a verbatim duplicate sitting directly under the
	// title. An `isRootStage` guard tried to catch this by comparing
	// statementId to topParentId, but that is only true for a top-level
	// question: every sub-question failed the check and re-printed its own
	// title. Removed rather than re-guarded, because the remaining call sites
	// (QuestionPage, SwitchScreen) always render the routed statement, and the
	// one caller that renders a stage in a list already opted out via the
	// showStageTitle prop.

	return (
		<>
			{hasAnswers ? (
				<div
					className={`${styles['stage-page']} ${
						statement?.evaluationSettings?.evaluationUI === EvaluationUI.voting
							? styles['stage-page--voting']
							: ''
					} wrapper`}
				>
					<StagePageSwitch statement={statement} />
				</div>
			) : (
				<AnswersEmptyState canAddAnswer={canAddAnswer} />
			)}
			{showBottomNav && (
				<div className={styles.bottomNav}>
					<StatementBottomNav />
				</div>
			)}
		</>
	);
};

export default StagePage;

interface AnswersEmptyStateProps {
	readonly canAddAnswer: boolean;
}

const ADD_STEPS = [
	{
		Icon: Lightbulb,
		titleKey: 'solutionsOnboarding.shareSolution',
		textKey: 'solutionsOnboarding.shareSolutionDesc',
	},
	{
		Icon: Plus,
		titleKey: 'solutionsOnboarding.addSolution',
		textKey: 'solutionsOnboarding.addSolutionDesc',
	},
	{
		Icon: MessageSquare,
		titleKey: 'solutionsOnboarding.convertFromDiscussion',
		textKey: 'solutionsOnboarding.convertFromDiscussionDesc',
	},
] as const;

function AnswersEmptyState({ canAddAnswer }: AnswersEmptyStateProps) {
	const { t } = useTranslation();

	if (!canAddAnswer) {
		return (
			<div className={styles.onboarding}>
				<p className={styles.onboarding__stepText}>{t('No suggestions yet')}</p>
			</div>
		);
	}

	return (
		<div className={styles.onboarding}>
			{ADD_STEPS.map(({ Icon, titleKey, textKey }) => (
				<div className={styles.onboarding__step} key={titleKey}>
					<span className={styles.onboarding__icon}>
						<Icon size={20} />
					</span>
					<div className={styles.onboarding__content}>
						<h3 className={styles.onboarding__stepTitle}>{t(titleKey)}</h3>
						<p className={styles.onboarding__stepText}>{t(textKey)}</p>
					</div>
				</div>
			))}
		</div>
	);
}

interface StagePageSwitchProps {
	readonly statement: Statement;
}

function StagePageSwitch({ statement }: StagePageSwitchProps) {
	const evaluationUI = statement?.evaluationSettings?.evaluationUI;

	switch (evaluationUI) {
		case EvaluationUI.suggestions:
			return <SuggestionCards />;
		case EvaluationUI.voting:
			return <StatementVote />;
		case EvaluationUI.clustering:
			return <Clustering />;
		default:
			return <SuggestionCards />;
	}
}
