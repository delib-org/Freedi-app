import React from 'react';
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import AddQuestionIcon from '@/assets/icons/questionIcon.svg?react';
import CompoundIcon from '@/assets/icons/stepsIcon.svg?react';
import styles from './AddButton.module.scss';
import { StatementType, QuestionType, CompoundPhase } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useDispatch, useSelector } from 'react-redux';
import {
	setNewStatementModal,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { useParams } from 'react-router';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { getDefaultQuestionType } from '@/models/questionTypeDefaults';

export default function AddButton() {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelectorById(statementId || ''));
	const dispatch = useDispatch();
	const [actionsOpen, setActionsOpen] = React.useState(false);

	const { dir } = useTranslation();
	const radius = 5;

	const handleAction = (action: 'question' | 'compound') => {
		setActionsOpen(false);
		switch (action) {
			case 'question':
				dispatch(
					setNewStatementModal({
						parentStatement: statement,
						newStatement: {
							statementType: StatementType.question,
							questionSettings: {
								questionType: getDefaultQuestionType(),
							},
						},
						isLoading: false,
						error: null,
						showModal: true,
					}),
				);
				break;
			case 'compound':
				dispatch(
					setNewStatementModal({
						parentStatement: statement,
						newStatement: {
							statementType: StatementType.question,
							questionSettings: {
								questionType: QuestionType.compound,
								compoundSettings: {
									currentPhase: CompoundPhase.defineQuestion,
								},
							},
						},
						isLoading: false,
						error: null,
						showModal: true,
					}),
				);
				break;
			default:
				break;
		}
	};

	const toggleActions = () => {
		setActionsOpen((prev) => !prev);
	};

	const actions = [
		{
			key: 'question',
			action: 'question' as const,
			icon: <AddQuestionIcon />,
		},
		{
			key: 'compound',
			action: 'compound' as const,
			icon: <CompoundIcon />,
		},
	];

	return (
		<div className={`${styles.actions}`}>
			{actions.map(({ key, action, icon }, index) => {
				let angle: number;
				if (dir === 'ltr') {
					angle = -90 + (index * 90) / (actions.length - 1);
				} else {
					angle = -90 + (index * -90) / (actions.length - 1);
				}

				const x = Math.cos((angle * Math.PI) / 180) * radius;
				const y = Math.sin((angle * Math.PI) / 180) * radius;

				return (
					<IconButton
						key={key}
						onClick={() => handleAction(action)}
						className={`${styles.actionBtn} ${actionsOpen ? styles.visible : ''}`}
						title={`add ${action}`}
						style={
							{
								position: 'absolute',
								top: '-50%',
								left: '-50%',
								'--x': `${x}rem`,
								'--y': `${y}rem`,
								transitionDelay: `${index * 0.1}s`,
								backgroundColor: action === 'compound' ? '#47b4ef' : '',
							} as React.CSSProperties
						}
					>
						{icon}
					</IconButton>
				);
			})}
			{actionsOpen && (
				<button
					className={`${styles.invisibleBackground}`}
					onClick={() => dispatch(setShowNewStatementModal(false))}
				></button>
			)}
			<IconButton
				onClick={toggleActions}
				className={`${styles.plusButton} ${actionsOpen ? styles.active : ''}`}
			>
				<PlusIcon />
			</IconButton>
		</div>
	);
}
