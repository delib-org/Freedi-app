import {
	FC,
	useContext,
	useState,
	useMemo,
	useRef,
} from 'react';
import { StatementContext } from '../../../../StatementCont';
import styles from './MultiStageQuestion.module.scss';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import AddStage from './addStage/AddStage';
import { useSelector } from 'react-redux';
import {
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import { Statement, StatementType } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import StagePage from '../../stage/StagePage';
import MultiStageQuestionsBar from '../../../multiStageQuestionsBar/MultiStageQuestionsBar';
import StageList from './stages/StageList';

const MultiStageQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const { t } = useUserConfig();
	const statementsFromStore = useSelector(
		statementSubsSelector(statement?.statementId)
	);

	const infoRef = useRef<HTMLDivElement | null>(null);
	const questionsRef = useRef<HTMLDivElement | null>(null);
	const suggestionsRef = useRef<HTMLDivElement | null>(null);
	const votingRef = useRef<HTMLDivElement | null>(null);
	const summaryRef = useRef<HTMLDivElement | null>(null);

	// const sectionRefs = {
	// 	info: infoRef,
	// 	questions: questionsRef,
	// 	suggestions: suggestionsRef,
	// 	voting: votingRef,
	// 	summary: summaryRef,
	// };

	// By categorizing statement types, we can selectively provide data to the bar component via props, optimizing its rendering to show only the required information.
	const initialStages = useMemo(
		() =>
			statementsFromStore
				.filter(
					(sub: Statement) =>
						sub.statementType === StatementType.question
				)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[statementsFromStore]
	);

	const [showAddStage, setShowAddStage] = useState<boolean>(false);

	return (
		<>
			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}
			<div className={styles.stagesWrapper}>
				<MultiStageQuestionsBar questions voting suggestions summary />
				<div className={`btns ${styles['add-stage']}`}>
					<Button
						text={t('Add sub-question')}
						type='button'
						buttonType={ButtonType.PRIMARY}
						onClick={() => setShowAddStage(true)}
					/>
				</div>
				{initialStages.length === 0 ? (
					<StagePage />) :
					(
						<div className={styles.stagesWrapper}>
							<h2 className={styles.title}>
								{t('Document')}: {statement.statement}
							</h2>
							<div className={styles.description}>
								{statement?.description}
							</div>
							<div ref={infoRef} id="info"><StageList imageType='info' statements={[statement]} isSuggestions /></div>
							<div ref={questionsRef} id="questions"><StageList imageType='questions' statements={initialStages} /></div>
							<div ref={suggestionsRef} id="suggestions"><StageList imageType='suggestions' statements={initialStages} /></div>
							<div ref={votingRef} id="voting"><StageList imageType='voting' statements={initialStages} /></div>
							<div ref={summaryRef} id="summary"><StageList imageType='summary' statements={initialStages} /></div>
						</div>
					)}
			</div>
		</>
	);
};

export default MultiStageQuestion;