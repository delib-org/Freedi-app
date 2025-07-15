import React, { FC, useEffect, useRef, useState } from 'react';

// Third Party

// Redux Store
import { useParams } from 'react-router';
import StatementChatMore from '../../../../chat/components/statementChatMore/StatementChatMore';
import CreateStatementModal from '../../../../createStatementModal/CreateStatementModal';
import { sortSubStatements } from '../../../statementsEvaluationCont';
import Evaluation from '../../evaluation/Evaluation';
import SolutionMenu from '../../solutionMenu/SolutionMenu';
import AddQuestionIcon from '@/assets/icons/addQuestion.svg?react';
import { setStatementIsOption } from '@/controllers/db/statements/setStatements';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import useStatementColor, {
	StyleProps,
} from '@/controllers/hooks/useStatementColor';
import { setStatementElementHight } from '@/redux/statements/statementsSlice';
import EditTitle from '@/view/components/edit/EditTitle';
import IconButton from '@/view/components/iconButton/IconButton';
import './SuggestionCard.scss';
import { StatementType, Statement } from 'delib-npm';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { toggleJoining } from '@/controllers/db/joining/setJoining';
import Joined from '@/view/components/joined/Joined';

interface Props {
	statement: Statement | undefined;
	siblingStatements: Statement[];
	parentStatement: Statement | undefined;
}

const SuggestionCard: FC<Props> = ({
	parentStatement,
	siblingStatements,
	statement,
}) => {
	// Hooks
	if (!parentStatement) console.error('parentStatement is not defined');

	const { t, dir } = useUserConfig();
	const { isAuthorized, isAdmin, creator } = useAuthorization(statement.statementId);
	const { sort } = useParams();
	const enableJoining = parentStatement?.statementSettings?.joiningEnabled;

	// Redux Store
	const dispatch = useAppDispatch();

	// Use Refs
	const elementRef = useRef<HTMLDivElement>(null);

	const hasJoinedServer = statement?.joined?.find(
		(c) => c.uid === creator?.uid
	) ? true : false;

	// Optimistic state for instant UI updates
	const [hasJoinedOptimistic, setHasJoinedOptimistic] = useState(hasJoinedServer);
	const [isJoinLoading, setIsJoinLoading] = useState(false);

	// Update optimistic state when server state changes
	useEffect(() => {
		setHasJoinedOptimistic(hasJoinedServer);
	}, [hasJoinedServer]);

	// Use States

	const [isEdit, setIsEdit] = useState(false);
	const [shouldShowAddSubQuestionModal, setShouldShowAddSubQuestionModal] =
		useState(false);
	const [isCardMenuOpen, setIsCardMenuOpen] = useState(false);

	useEffect(() => {
		sortSubStatements(siblingStatements, sort, 30);
	}, [statement?.elementHight]);

	const statementColor: StyleProps = useStatementColor({
		statement,
	});

	useEffect(() => {
		const element = elementRef.current;
		if (element) {
			setTimeout(() => {
				dispatch(
					setStatementElementHight({
						statementId: statement.statementId,
						height: elementRef.current?.clientHeight,
					})
				);
			}, 0);
		}
	}, [elementRef.current?.clientHeight]);

	function handleSetOption() {
		try {
			if (statement?.statementType === 'option') {
				const cancelOption = window.confirm(
					'Are you sure you want to cancel this option?'
				);
				if (cancelOption) {
					setStatementIsOption(statement);
				}
			} else {
				setStatementIsOption(statement);
			}
		} catch (error) {
			console.error(error);
		}
	}

	async function handleJoin() {
		// Optimistically update the UI immediately
		setHasJoinedOptimistic(!hasJoinedOptimistic);
		setIsJoinLoading(true);

		try {
			// Call the API function in the background
			await toggleJoining(statement.statementId);
		} catch (error) {
			// If the API call fails, revert the optimistic update
			console.error('Failed to toggle joining:', error);
			setHasJoinedOptimistic(hasJoinedOptimistic); // revert to original state
			// Optionally show an error message to the user here
		} finally {
			setIsJoinLoading(false);
		}
	}

	const statementAge = new Date().getTime() - statement.createdAt;
	const hasChildren = parentStatement?.statementSettings?.hasChildren;

	if (!statement) return null;

	function handleRightClick(e: React.MouseEvent) {
		e.preventDefault();
		setIsCardMenuOpen(!isCardMenuOpen);
	}

	return (
		<div
			onContextMenu={(e) => handleRightClick(e)}
			className={
				statementAge < 10000
					? 'statement-evaluation-card statement-evaluation-card--new'
					: 'statement-evaluation-card'
			}
			style={{
				top: `${statement.top || 0}px`,
				borderLeft: `8px solid ${statement.isChosen ? 'var(--approve)' : statementColor.backgroundColor || 'white'}`,
				color: statementColor.color,
				flexDirection: dir === 'ltr' ? 'row' : 'row-reverse',
				opacity: statement.hide ? 0.5 : 1,
				pointerEvents: (statement.hide && !isAuthorized ? 'none' : 'auto'),
			}}
			ref={elementRef}
			id={statement.statementId}
		>
			<div
				className='selected-option'
				style={{
					backgroundColor:
						statement.isVoted === true ? 'var(--approve)' : '',
				}}
			>
				<div
					style={{
						color: statementColor.color,
						display: statement.isVoted ? 'block' : 'none',
					}}
				>
					{t('Selected')}
				</div>
			</div>
			<div className='main'>
				<div className='info'>
					<div className='text'>
						<EditTitle
							statement={statement}
							isEdit={isEdit}
							setEdit={setIsEdit}
							isTextArea={true}
						/>
						{enableJoining &&
							<div className="btns btns--end">
								<Joined statement={statement} />
								<button
									onClick={handleJoin}
									disabled={isJoinLoading}
									className="btn btn--small"
									style={{
										backgroundColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
										color: hasJoinedOptimistic ? 'white' : 'inherit',
										borderColor: hasJoinedOptimistic ? 'var(--approve)' : 'inherit',
										opacity: isJoinLoading ? 0.7 : 1,
										cursor: isJoinLoading ? 'not-allowed' : 'pointer'
									}}
								>
									{hasJoinedOptimistic ? t('Leave') : t('Join')}
								</button>
							</div>
						}
					</div>
					<div className='more'>
						<SolutionMenu
							statement={statement}
							isAuthorized={isAuthorized}
							isAdmin={isAdmin}
							isCardMenuOpen={isCardMenuOpen}
							setIsCardMenuOpen={setIsCardMenuOpen}
							isEdit={isEdit}
							setIsEdit={setIsEdit}
							handleSetOption={handleSetOption}
						/>
					</div>
				</div>

				<div className='actions'>
					{hasChildren && (
						<div className='chat chat-more-element'>
							<StatementChatMore statement={statement} />
						</div>
					)}
					<div className='evolution-element'>
						<Evaluation statement={statement} />
					</div>
					{hasChildren && (
						<IconButton
							className='add-sub-question-button more-question'
							style={{ display: 'none', cursor: 'default' }} // changed to display none for it to not take dom space
							onClick={
								() => { } //delete the brackets and uncomment the line below for functionality
								//	setShouldShowAddSubQuestionModal(true)
							}
						>
							<AddQuestionIcon />
						</IconButton>
					)}
				</div>
				{shouldShowAddSubQuestionModal && (
					<CreateStatementModal
						allowedTypes={[StatementType.question]}
						parentStatement={statement}
						isOption={false}
						setShowModal={setShouldShowAddSubQuestionModal}
					/>
				)}
			</div>
		</div>
	);
};

export default SuggestionCard;
