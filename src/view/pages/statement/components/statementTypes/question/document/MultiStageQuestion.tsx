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
import StageList from './stages/StageList';
import MultiStageQuestionsBar from '../../../multiStageQuestionsBar/MultiStageQuestionsBar';
import HeaderStage from './stages/HeaderStage';

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

	const questionStatements = useMemo(
		() =>
			statementsFromStore
				.filter(
					(sub: Statement) =>
						sub.statementType === StatementType.question
				)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[statementsFromStore]
	);

	const suggestionStatements = [];

	const votingStatements = [];

	const summaryStatements = [];

	const [showAddStage, setShowAddStage] = useState<boolean>(false);

	return (
		<>
			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}
			<div className={styles.stagesWrapper}>
				<MultiStageQuestionsBar
					infoData={statement}
					questionsData={questionStatements}
					suggestionsData={suggestionStatements}
					votingData={votingStatements}
					summaryData={summaryStatements}
				/>
				<div className={`btns ${styles['add-stage']}`}>
					<Button
						text={t('Add sub-question')}
						type='button'
						buttonType={ButtonType.PRIMARY}
						onClick={() => setShowAddStage(true)}
					/>
				</div>
				<div>
					{questionStatements.length === 0 ? (
						<StagePage />) :
						(
							<div className={styles.stagesWrapper}>
								<h2 ref={infoRef} id="info" className={styles.title}>
									{t('Document')}: {statement.statement}
								</h2>
								<HeaderStage imageType='info' statement={statement} />
								<div ref={questionsRef} id="questions">
									<StageList imageType='questions' statements={questionStatements} isSuggestions />
								</div>
							</div>
						)}
					{suggestionStatements.length > 0 && <div ref={suggestionsRef} id="suggestions"><StageList imageType='suggestions' statements={suggestionStatements} /></div>}
					{votingStatements.length > 0 && <div ref={votingRef} id="voting"><StageList imageType='voting' statements={votingStatements} /></div>}
					{summaryStatements.length > 0 && <div ref={summaryRef} id="summary"><StageList imageType='summary' statements={summaryStatements} /></div>}
				</div>
			</div>
		</>
	);
};

export default MultiStageQuestion;