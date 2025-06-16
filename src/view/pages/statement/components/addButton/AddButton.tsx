import React, { useContext } from 'react';
import IconButton from '@/view/components/iconButton/IconButton';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import AddQuestionIcon from '@/assets/icons/questionIcon.svg?react';
import AddMassConsensusIcon from '@/assets/icons/massConsensusIcon.svg?react';
import AddSubGroupIcon from '@/assets/icons/team-group.svg?react';
import styles from './AddButton.module.scss'
import { QuestionType, StatementType } from 'delib-npm';
import { StatementContext } from '../../StatementCont';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useDispatch, useSelector } from 'react-redux';
import { setNewStatementModal } from '@/redux/statements/newStatementSlice';
import { useParams } from 'react-router';
import { statementSelectorById } from '@/redux/statements/statementsSlice';

export default function AddButton() {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelectorById(statementId || ''));
	const dispatch = useDispatch();
	const [actionsOpen, setActionsOpen] = React.useState(false);
	const { dir } = useUserConfig();
	const radius = 5;

	const handleAction = (
		action: 'question' | 'mass-consensus' | 'subgroup'
	) => {
		console.log("handleAction", action);
		switch (action) {
			case 'question':
				dispatch(setNewStatementModal({
					parentStatement: statement,
					newStatement: {
						statementType: StatementType.question,
						questionSettings: {
							questionType: QuestionType.multiStage,
						},
					},
					isLoading: false,
					error: null,
					showModal: true,
				}));

				break;
			case 'mass-consensus':
				dispatch(setNewStatementModal({
					parentStatement: statement,
					newStatement: {
						statementType: StatementType.question,
						questionSettings: {
							questionType: QuestionType.massConsensus,
						},
					},
					isLoading: false,
					error: null,
					showModal: true,
				}));

				break;
			case 'subgroup':
				dispatch(setNewStatementModal({
					parentStatement: statement,
					newStatement: {
						statementType: StatementType.group,
					},
					isLoading: false,
					error: null,
					showModal: true,
				}));
				break;
			default:
				break;
		}
	};

	const toggleActions = () => setActionsOpen(!actionsOpen);

	const actions = [
		{
			key: 'question',
			action: 'question' as const,
			icon: <AddQuestionIcon />,
		},
		{
			key: 'mass-consensus',
			action: 'mass-consensus' as const,
			icon: <AddMassConsensusIcon />,
		},
		{
			key: 'subgroup',
			action: 'subgroup' as const,
			icon: <AddSubGroupIcon />,
		}
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
						className={`${styles.actionBtn} ${actionsOpen ? styles.visible : ""}`}
						title={`add ${action}`}
						style={{
							position: "absolute",
							top: "-50%",
							left: "-50%",
							"--x": `${x}rem`,
							"--y": `${y}rem`,
							transitionDelay: `${index * 0.1}s`,
							backgroundColor: `${action === 'subgroup' ? '#a879e0' : ''}`
						} as React.CSSProperties}
					>
						{icon}
					</IconButton>
				);
			})}
			{actionsOpen && (
				<button
					className={`${styles.invisibleBackground}`}
					onClick={() => setActionsOpen(false)}
				></button>
			)
			}
			<IconButton onClick={toggleActions} className={`${styles.plusButton} ${actionsOpen ? styles.active : ""}`}>
				<PlusIcon />
			</IconButton>
		</div >
	);
}
