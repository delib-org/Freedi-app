import { useEffect, useRef } from 'react';
import SuggestionCards from '../../evaluations/components/suggestionCards/SuggestionCards';
import styles from './StagePage.module.scss'
import StatementBottomNav from '../../nav/bottom/StatementBottomNav';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import StatementVote from '../../vote/StatementVote';
import { useParams } from 'react-router';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';
import { Statement } from '@/types/statement/StatementTypes';
import { EvaluationUI } from '@/types/evaluation/Evaluation';

const StagePage = () => {
	const { statementId } = useParams();
	const { t } = useLanguage();
	const statement = useSelector(statementSelectorById(statementId));
	const stageRef = useRef<HTMLDivElement>(null);

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

	const stageName = statement?.statement ? `: ${t(statement.statement)}` : "";

	return (
		<>
			<h2>{t("Stage")}{statement?.statement && stageName}</h2>
			<p className="mb-4">Stage description</p>
			<StagePageSwitch statement={statement} />
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

	if (evaluationUI === EvaluationUI.suggestions) {
		return <SuggestionCards />;
	} else if (evaluationUI === EvaluationUI.voting) {
		return <StatementVote />;
	} else {
		return <SuggestionCards />;
	}
}
