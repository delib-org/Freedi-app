import { useContext, useEffect, useRef } from 'react';
import SuggestionCards from '../../evaluations/components/suggestionCards/SuggestionCards';
import styles from './StagePage.module.scss';
import StatementBottomNav from '../../nav/bottom/StatementBottomNav';
import StatementVote from '../../vote/StatementVote';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementContext } from '../../../StatementCont';
import { Statement, EvaluationUI } from 'delib-npm';
import Clustering from '../../clustering/Clustering';

interface Props {
	showStageTitle?: boolean;
}

const StagePage = ({ showStageTitle = true }: Props) => {
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const stageRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const updateHeight = () => {
			if (stageRef.current) {
				const topPosition =
					stageRef.current.getBoundingClientRect().top;
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

	const stageName = statement?.statement ? `: ${t(statement.statement)}` : '';
	const isClustering =
		statement?.evaluationSettings?.evaluationUI === EvaluationUI.clustering;

	return (
		<>
			<div className={`${styles['stage-page']} wrapper`}>
				{!isClustering && showStageTitle && (
					<h2>
						{t('Stage')}
						{statement?.statement && stageName}
					</h2>
				)}
				<StagePageSwitch statement={statement} />
			</div>
			<div className={styles.bottomNav}>
				<StatementBottomNav />
			</div>
		</>
	);
};

export default StagePage;

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
